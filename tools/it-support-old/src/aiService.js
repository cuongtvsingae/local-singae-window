const axios = require('axios');
const config = require('./config');

// Strict JSON shape the AI must follow
// {
//   status: 'ok'|'error',
//   action: string, // single state machine (no separate "step")
//   data?: { task?: { title?: string, description?: string, level?: string, room?: string, type?: string, deadline?: string }, missing_fields?: string[] },
//   message: string,
// }

// Extensible task field definitions (single source for prompt guidance)
// Add new fields here when task schema grows.
// Task fields the assistant can collect and send back when action="CREATE_TASK"
const TASK_FIELDS = ['title', 'description', 'type', 'room', 'level', 'deadline'];
// ACTION = single state machine for the whole conversation session (no separate "step").
// A session is complete ONLY when action="END".
const ACTIONS = ['OPEN', 'ASK', 'COLLECT_INFOMATION', 'CONFIRM', 'CREATE_TASK', 'END'];

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeAction(action) {
	return String(action || '').trim();
}

function extractActionHintFromText(text) {
	const t = String(text || '');
	const m = t.match(/\baction\s*=\s*(OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END)\b/i);
	if (m) return String(m[1] || '').toUpperCase();
	const m2 = t.match(/\[(?:action|ACTION)\s*=\s*(OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END)\]/);
	if (m2) return String(m2[1] || '').toUpperCase();
	return '';
}

function stripHistoryPrefix(raw) {
	const t = String(raw || '').trim();
	// Remove common "[time][kind=...][action=...]" prefixes (one or more)
	return t.replace(/^\s*(\[[^\]]*\]\s*){1,4}/, '').trim();
}

function repairNonJsonToDecision(rawText) {
	const action = extractActionHintFromText(rawText) || 'ASK';
	const msg = stripHistoryPrefix(rawText);
	return coerceAiResponse({
		status: 'ok',
		action,
		data: {},
		message: msg || 'Em chưa nhận được JSON hợp lệ. Anh/chị thử gửi lại giúp em nhé.',
		_repaired_from_non_json: true,
	});
}

function mapLegacyToNewAction(legacyAction, legacyStep) {
	const a = String(legacyAction || '').trim();
	const s = String(legacyStep || '').trim();
	const step = s === 'EXCUTE' ? 'EXECUTE' : s;

	// Old: action in TASK/FAQ/UNKNOWN + step in ASK/CONFIRM/EXECUTE/DONE
	if (a === 'TASK' || a === 'CREATE_TASK') {
		if (step === 'EXECUTE') return 'CREATE_TASK';
		if (step === 'CONFIRM') return 'CONFIRM';
		if (step === 'DONE') return 'END';
		return 'COLLECT_INFOMATION';
	}
	if (a === 'FAQ' || a === 'ANSWER_FAQ') {
		if (step === 'DONE') return 'END';
		return 'ASK';
	}
	if (a === 'UNKNOWN') {
		return 'OPEN';
	}
	return null;
}

function ensureStringArray(x) {
	if (!Array.isArray(x)) return null;
	for (const v of x) if (typeof v !== 'string') return null;
	return x;
}

function coerceSuggestions(x) {
	const arr = ensureStringArray(x);
	if (!arr) return null;
	const clean = arr.map((s) => String(s || '').trim()).filter(Boolean);
	if (clean.length === 0) return null;
	return clean.slice(0, 3);
}

function ensureTaskShape(task) {
	const out = typeof task === 'object' && task !== null ? task : {};
	for (const k of TASK_FIELDS) {
		if (typeof out[k] !== 'string') out[k] = '';
	}
	return out;
}

function coerceAiResponse(obj) {
	// Keep message ALWAYS; coerce other fields to safe defaults so we never block UI.
	const out = typeof obj === 'object' && obj !== null ? obj : {};

	out.status = out.status === 'error' ? 'error' : 'ok';
	// Normalize action (supports legacy action+step by mapping to new action-only state machine)
	out.action = normalizeAction(out.action);
	if (!ACTIONS.includes(out.action)) {
		const mapped = mapLegacyToNewAction(out.action, out.step);
		out.action = mapped && ACTIONS.includes(mapped) ? mapped : 'OPEN';
	}

	if (typeof out.message !== 'string') out.message = '';
	// Normalize message so frontend renders consistently (newline + bold markers)
	out.message = String(out.message || '')
		.replace(/\\\\n/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\\\\\*/g, '*')
		.replace(/\\\*/g, '*')
		// normalize bullets and numbered lists
		.replace(/^\s*[\u2022]\s+/gm, '- ')
		.replace(/^\s*\d+\s*[\.\)]\s+/gm, '- ')
		// normalize legacy *bold* -> **bold**
		.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '**$1**')
		// strip HTML tags defensively (plain-text only)
		.replace(/<[^>]+>/g, '');

	if (out.data === undefined || out.data === null || typeof out.data !== 'object') out.data = {};
	// Always keep base schema keys so frontend never sees missing fields.
	out.data.task = ensureTaskShape(out.data.task);
	if (!Array.isArray(out.data.missing_fields)) out.data.missing_fields = [];
	if (!Array.isArray(out.data.learning)) out.data.learning = [];
	if (Array.isArray(out.data.learning)) {
		out.data.learning = out.data.learning.map((it) => ({
			id: typeof it?.id === 'string' ? it.id : '',
			topic: typeof it?.topic === 'string' ? it.topic : '',
			keywords: typeof it?.keywords === 'string' ? it.keywords : '',
			desc: typeof it?.desc === 'string' ? it.desc : '',
			solution: typeof it?.solution === 'string' ? it.solution : '',
		}));
	}

	// Ensure nested objects exist for task-related states (but don't invent content)
	if (out.action === 'COLLECT_INFOMATION' || out.action === 'CONFIRM' || out.action === 'CREATE_TASK') {
		if (out.data.task === undefined || out.data.task === null || typeof out.data.task !== 'object') out.data.task = {};
		if (out.data.missing_fields !== undefined) {
			const mf = ensureStringArray(out.data.missing_fields);
			if (mf === null) delete out.data.missing_fields;
		}
	}

	// Suggestions: keep only if valid; otherwise default to empty array
	{
		const s = coerceSuggestions(out.data?.suggestions);
		if (s) out.data.suggestions = s;
		else out.data.suggestions = [];
	}

	// Conversation termination is action-only:
	// - user starts a session with user_action="OPEN"
	// - assistant ends a session with action="END"

	return out;
}

// Validate by flow so it is easy to extend later (add new action/step + new validator).
function validateByFlow(obj) {
	// Always: message is shown to user; the rest is internal orchestration.
	if (obj.action === 'CREATE_TASK') {
		if (typeof obj?.data !== 'object' || obj.data === null) {
			throw new Error('For action CREATE_TASK, data must be an object');
		}
		if (typeof obj?.data?.task !== 'object' || obj.data.task === null) {
			throw new Error('For action CREATE_TASK, data.task must be an object');
		}
	}
	// Other actions: no required internal structure (still must have message)

	return true;
}

async function buildSystemPrompt() {
	// Inline system prompt (single source). Sheets no longer used for prompt.
	// The backend will provide: RAG knowledge (system), sample chats (appended after user prompt),
	// and recent history (context). The model MUST rely on those signals.
	return [
		{
			role: 'system',
			content: [
				'[OUTPUT — BẮT BUỘC]',
				'Trả về DUY NHẤT 1 object JSON hợp lệ. Không markdown. Không text thừa. Không HTML.',
				'Schema (luôn đủ key):',
				'{"status":"ok|error","action":"OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END","data":{"task":{"title":"","description":"","type":"","room":"","level":"high|medium|low","deadline":""},"missing_fields":[],"suggestions":["","",""],"learning":[]},"message":""}',
				'Rule: Nếu cần nói gì với user thì đặt trong "message". "message" KHÔNG được rỗng.',
				'BẮT BUỘC CONFIRM trước khi tạo ticket.',				
				'BẮT BUỘC giải thích lý do cho mọi hành động.',				
				'BẮT BUỘC mỗi tin nhắn đủ 3 phần tóm tắt/hướng dẫn sự cố/gợi ý(suggestions != empty).',				
				'BẮT BUỘC hạn chế lặp từ trong 1 tin nhắn.',				
				'',
				'[FORMAT message]',
				'- text thuần, xuống dòng dùng \\n',
				'- Phải có ít nhất 1 câu in đậm dùng **...** (không dùng HTML)',
				'- list dùng "- " đầu dòng',
				'- phải dùng icon/emoji cho dễ hiểu, không được để rỗng',
				'- phải dùng tiếng việt có dấu, nói chuyện hài hước',
				'',
				'[VAI TRÒ]',
				'Bạn là Trợ lý IT cho nhân viên Nha Khoa Singae (quản lý: IT Trương Văn Cường, SĐT: 0862228882). Xưng "em".',
				'Gọi người dùng: gender=male → "anh {call_name}", gender=female → "chị {call_name}", không rõ → "anh/chị {call_name}". Giữ nhất quán trong phiên.',
				'',
				'[LUỒNG ACTION]',
				'- OPEN: giới thiệu + hỏi mục đích (CHỈ chào khi lịch sử chat rỗng hoặc lâu không chat).',
				'- ASK: chẩn đoán/hướng dẫn online nếu được/luôn hỏi ý kiến nếu cảm thấy cần tạo ticket',
				'- COLLECT_INFOMATION: hỏi thêm đúng 1 trường còn thiếu (ưu tiên type → room → level → chi tiết)/Nếu thấy những thông tin user cung cấp có thể hướng dẫn xử lý thì hướng dẫn ngay không cần tạo ticket',
				'- CONFIRM: tóm tắt + hỏi xác nhận',
				'- CREATE_TASK: chỉ khi user xác nhận; điền data.task đầy đủ để backend tạo, giới thiệu lại, cảm ơn và tạm biệt',
				'- END: cảm ơn + xin đánh giá',
				'',
				'[QUY TẮC THU THẬP]',
				'- KHÔNG DÙNG null. Thiếu dữ liệu thì để chuỗi rỗng "".',
				'- Nếu cần hỏi thêm: CHỈ hỏi 1 câu; data.missing_fields chỉ chứa 1 field đang hỏi.',
				'- Khi đã thu thập đủ thông tin tạo task, list thông tin đã thu thập và gửi cho user xác nhận.',
				'- Dựa lịch sử + KB (RAG) + LEARNING_KB_JSON + KB_SEARCH_JSON + SAMPLE CHATS; không bịa.',
				'- ƯU TIÊN GIẢI QUYẾT ONLINE: luôn kiểm tra LEARNING_KB_JSON/KB_SEARCH_JSON/KB(RAG)/SAMPLE CHATS xem có hướng xử lý không. Nếu có cách xử lý hợp lý → hướng dẫn user làm trước.',
				'- CHỈ TẠO TICKET KHI CẦN THIẾT: chỉ đi tới CONFIRM/CREATE_TASK khi (a) sự cố cần hỗ trợ trực tiếp/không thể xử lý online, hoặc (b) đã thử hướng dẫn nhưng không được, hoặc (c) user yêu cầu tạo ticket.',
				'- Nếu đã có hướng dẫn và user làm theo được: action=ASK và sau đó action=END (không tạo ticket).',
				'- Luôn tự đọc lại lịch sử chat để hiểu user đã nói gì, thu thập được thông tin gì, tránh hỏi lại những thông tin cũ (ví dụ nói tầng 4 rồi thì chỉ đưa gợi ý list phòng tầng 4).',
				'- Trước khi hỏi lại một field, phải tự rà trong lịch sử chat xem đã có thông tin đó chưa. Chỉ hỏi lại khi KHÔNG tìm thấy hoặc user cung cấp mâu thuẫn.',
				'- Nếu user cung cấp room không nằm trong DB_OPTIONS_JSON.rooms: phải action=COLLECT_INFOMATION + data.missing_fields=["room"] và hỏi confirm/chọn lại room đúng trong list.',
				'',
				'[suggestions]',
				'- data.suggestions là tuỳ chọn. CHỈ dùng khi bạn đưa ra lựa chọn rẽ nhánh.',
				'- Mỗi suggestion là đúng 1 option ngắn cố gắng 2 3 từ để user bấm gửi nhanh (vd: độ ưu tiên=cao(high)/thường(medium)/bình thường(low)).',
				'',
				'[learning]',
				'- Server sẽ gửi LEARNING_KB (từ Google Sheet "learning") trong context.',
				'- Nếu bạn phát hiện kiến thức mới (case mới, lỗi mới, giải pháp mới) CHƯA có trong LEARNING_KB/KB_SEARCH_JSON thì trả về data.learning là list object để server lưu thêm.',
				'- Mỗi object trong data.learning gồm: { "id": "...", "topic": "...", "keywords": "...", "desc": "...", "solution": "..." }',
				'- Nếu là câu hỏi mới chưa có giải pháp: vẫn phải thêm learning với solution="" để admin cập nhật sau.',
				'- Yêu cầu: desc ngắn gọn/đủ ý; keywords là chuỗi từ khóa cách nhau bởi dấu phẩy; solution là gợi ý giải pháp/checklist ngắn.',
			].join('\n'),
		},
	];
}

function validateAiResponse(obj) {
	for (const k of ['status', 'action', 'message']) {
		if (!(k in obj)) {
			throw new Error(`AI response missing key: ${k}`);
		}
	}
	obj.action = normalizeAction(obj.action);
	if (typeof obj.action !== 'string' || obj.action.length < 1) {
		throw new Error('AI response "action" must be a non-empty string');
	}
	if (!ACTIONS.includes(obj.action)) {
		// allow legacy action+step, will be mapped in coerceAiResponse
		const mapped = mapLegacyToNewAction(obj.action, obj.step);
		// Do NOT hard-fail for unknown action in normal chat; coerce will safely default.
		if (mapped && ACTIONS.includes(mapped)) {
			obj.action = mapped;
		} else {
			obj.action = 'ASK';
		}
	}
	if (!['ok', 'error'].includes(obj.status)) {
		throw new Error('AI response "status" must be "ok" or "error"');
	}
	if (typeof obj.message !== 'string') {
		throw new Error('AI response "message" must be a string');
	}
	// Plain-text only: HTML will be stripped in coerceAiResponse (we don't hard-fail here)
	if (obj.action === 'CREATE_TASK') {
		if (obj.data !== undefined && (typeof obj.data !== 'object' || obj.data === null)) {
			throw new Error('AI response "data" must be an object when provided');
		}
	}
	validateByFlow(obj);
	return true;
}

async function callAi(messages) {
	const payload = {
		model: config.ai.model,
		messages,
		stream: false,
	};
	const headers = {
		'Content-Type': 'application/json',
	};
	if (config.ai.apiKey) {
		headers['Authorization'] = config.ai.apiKey;
	}
	try {
		// Retry on transient network reset: "socket hang up" / ECONNRESET
		for (let netAttempt = 0; netAttempt < 3; netAttempt++) {
		// Retry if AI violates format (do not store invalid attempts; caller can decide storage)
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const res = await axios.post(config.ai.url, payload, {
					headers,
					timeout: config.ai.timeoutMs,
				});
				const content = res?.data?.choices?.[0]?.message?.content ?? '';
				let parsed;
				try {
					parsed = JSON.parse(content);
				} catch {
					// Try to extract the first JSON object from the response.
					const m = String(content).match(/\{[\s\S]*\}/);
					if (!m) {
						const e = new Error('AI returned non-JSON response');
						e.raw_ai_content = String(content || '').slice(0, 45000);
						throw e;
					}
					try {
						parsed = JSON.parse(m[0]);
					} catch {
						const e = new Error('AI returned non-JSON response');
						e.raw_ai_content = String(content || '').slice(0, 45000);
						throw e;
					}
				}
				try {
					validateAiResponse(parsed);
					return coerceAiResponse(parsed);
				} catch (e) {
					// Treat schema/validation failures as format errors and run formatter retry once
					e.raw_ai_content = String(content || '').slice(0, 45000);
					throw e;
				}
			} catch (err) {
				// If AI returned non-JSON OR JSON failed validation, ask the model to reformat into strict JSON once.
				const msg = String(err?.message || '');
				const isFormatErr =
					msg.includes('AI returned non-JSON response') ||
					msg.includes('AI response missing key') ||
					msg.includes('AI response "action"') ||
					msg.includes('AI response "status"') ||
					msg.includes('AI response "message"') ||
					msg.includes('AI response "data"') ||
					msg.includes('For action CREATE_TASK');
				if (isFormatErr) {
					const raw = String(err?.raw_ai_content || '').slice(0, 45000);
					try {
						const fixMessages = [
							{
								role: 'system',
								content:
									'Bạn là "JSON FORMATTER". NHIỆM VỤ: chỉ trả về DUY NHẤT 1 object JSON hợp lệ theo schema dưới đây. ' +
									'Không được trả thêm bất kỳ chữ nào ngoài JSON. ' +
									'data.suggestions là tuỳ chọn; nếu có thì phải là mảng đúng string không rỗng. ' +
									'BẮT BUỘC: field "message" phải chứa nguyên văn câu trả lời cho người dùng (không được để rỗng). ' +
									'Bất kể input thế nào, phải xuất ra JSON hợp lệ.\n' +
									'Schema:\n' +
									'{"status":"ok|error","action":"OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END","data":{"task":{"title":"","description":"","type":"","room":"","level":"high|medium|low","deadline":""},"missing_fields":[],"suggestions":["","",""],"learning":[]},"message":""}',
							},
							{ role: 'user', content: `INPUT (raw AI output to convert):\n${raw}` },
						];
						const resFix = await axios.post(
							config.ai.url,
							{ model: config.ai.model, messages: fixMessages, stream: false },
							{ headers, timeout: config.ai.timeoutMs }
						);
						const fixed = resFix?.data?.choices?.[0]?.message?.content ?? '';
						const fixedParsed = JSON.parse(fixed);
						validateAiResponse(fixedParsed);
						const out = coerceAiResponse(fixedParsed);
						out._raw_ai_content = raw;
						out._format_fixed = true;
						// Guard: if formatter returned empty message, fall back to raw text so UI never shows blank bubble.
						if (!String(out?.message || '').trim()) {
							out.message = stripHistoryPrefix(raw);
						}
						return out;
					} catch {
						// fall through to structured error
					}
					const raw2 = String(err?.raw_ai_content || '').slice(0, 45000);
					const repaired = repairNonJsonToDecision(raw2);
					repaired._raw_ai_content = raw2;
					repaired._invalid_format = true;
					return repaired;
				}
				// Non-format errors: rethrow for gateway normalization below
				throw err;
			}
		}
		} // end netAttempt loop
	} catch (err) {
		// Normalize known error cases from gateway
		const status = err?.response?.status;
		const apiError = err?.response?.data?.error;
		let message = err.message || 'AI request failed';

		// Axios timeout -> upstream not responding fast enough (server still alive)
		const errMsg = String(err?.message || '');
		const errCode = String(err?.code || '');
		if (errCode === 'ECONNABORTED' || errMsg.toLowerCase().includes('timeout of')) {
			return {
				status: 'error',
				action: 'ASK',
				message: `AI upstream timeout sau ${config.ai.timeoutMs}ms. Kiểm tra AI_API_URL/AI worker hoặc tăng AI_TIMEOUT_MS.`,
				_invalid_format: false,
			};
		}

		// Special handling: socket hang up -> wait 1-2s and retry twice
		if (errMsg.toLowerCase().includes('socket hang up') || errCode === 'ECONNRESET') {
			for (let i = 0; i < 2; i++) {
				// wait 1-2 seconds
				// eslint-disable-next-line no-await-in-loop
				await sleep(randInt(1000, 2000));
				try {
					// eslint-disable-next-line no-await-in-loop
					const res2 = await axios.post(config.ai.url, payload, { headers, timeout: config.ai.timeoutMs });
					const content2 = res2?.data?.choices?.[0]?.message?.content ?? '';
					const parsed2 = JSON.parse(content2);
					validateAiResponse(parsed2);
					return coerceAiResponse(parsed2);
				} catch {
					// continue
				}
			}
			return {
				status: 'error',
				action: 'ASK',
				message: 'Hiện tại tất cả trợ lý đang bận, vui lòng chờ trong giây lát rồi thử lại.',
				_invalid_format: false,
			};
		}

		if (status === 401) message = 'AI unauthorized (401). Kiểm tra Bearer key.';
		if (status === 503) message = 'AI không có worker hoặc lỗi worker (503).';
		if (status === 504) message = 'AI timeout (504).';
		if (apiError?.message) message = `${message} (${apiError.message})`;
		return {
			status: 'error',
			action: 'ASK',
			message,
			detail: apiError?.detail || null,
			_invalid_format: false,
		};
	}
}

async function decide(userPrompt, context = []) {
	try {
		const sys = await buildSystemPrompt();
		// Lightweight RAG: include topK from local embeddings
		let rag = [];
		try {
			const { loadIndex, searchTopK } = require('./embeddings');
			const idx = loadIndex();
			if (idx) {
				const hits = searchTopK(idx, userPrompt, 6);
				if (hits.length > 0) {
					const joined = hits.map((h, i) => `#${i + 1}: ${h.text}`).join('\n\n');
					rag = [{ role: 'system', content: `KB (RAG) - trích xuất liên quan:\n${joined}` }];
				}
			}
		} catch {
			// ignore RAG errors; prompt is still valid
		}
		const messages = [...sys, ...rag, ...context, { role: 'user', content: userPrompt }];
		return await callAi(messages);
	} catch (e) {
		const msg = String(e?.message || '');
		if (msg === 'PROMPT_MISSING') {
			return {
				status: 'error',
				action: 'ASK',
				message: 'Không tìm thấy prompt cấu hình. Vui lòng kiểm tra sheet "promt" (ô A1) rồi thử lại.',
				_invalid_format: false,
			};
		}
		throw e;
	}
}

module.exports = {
	decide,
	// Expose for logging/debug so backend can log the exact system prompt used.
	buildSystemPrompt,
};

