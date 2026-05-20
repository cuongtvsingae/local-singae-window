const { callChatAPI } = require('../../../../../shared/openai/openaiServer');
const { getRuntimeConfig } = require('../../../../../chatbot/server/channelConfig');

// Strict JSON shape the AI must follow
// {
//   status: 'ok'|'error',
//   action: string, // single state machine (no separate "step")
//   data?: { task?: { title?: string, description?: string, level?: string, room?: string, type?: string, deadline?: string }, missing_fields?: string[] },
//   message: string,
// }

// Extensible task field definitions (single source for prompt guidance)
// Add new fields here when task schema grows.
const TASK_FIELDS = ['title', 'description', 'type', 'room', 'level', 'deadline'];
// ACTION = single state machine for the whole conversation session (no separate "step").
// A session is complete ONLY when action="END".
const ACTIONS = ['OPEN', 'ASK', 'COLLECT_INFOMATION', 'CONFIRM', 'CREATE_TASK', 'END'];

function normalizeAction(action) {
	return String(action || '').trim().toUpperCase();
}

function stripHistoryPrefix(raw) {
	const t = String(raw || '').trim();
	// Remove common "[time][kind=...][action=...]" prefixes (one or more)
	return t.replace(/^\s*(\[[^\]]*\]\s*){1,4}/, '').trim();
}

function extractActionHintFromText(text) {
	const t = String(text || '');
	const m = t.match(/\baction\s*=\s*(OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END)\b/i);
	if (m) return String(m[1] || '').toUpperCase();
	const m2 = t.match(/\[(?:action|ACTION)\s*=\s*(OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END)\]/);
	if (m2) return String(m2[1] || '').toUpperCase();
	return '';
}

function mapLegacyToNewAction(legacyAction, legacyStep) {
	const a = String(legacyAction || '').trim().toUpperCase();
	const s = String(legacyStep || '').trim().toUpperCase();
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
	if (a === 'UNKNOWN') return 'OPEN';
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
	// Normalize level into allowed values when possible
	{
		const lv = String(out.level || '').trim().toLowerCase();
		if (lv !== 'high' && lv !== 'medium' && lv !== 'low') out.level = '';
		else out.level = lv;
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
		.replace(/<[^>]+>/g, '')
		.trim();

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
			solution: typeof it?.solution === 'string' ? it.solution : ''
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

	return out;
}

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
	return true;
}

function validateAiResponse(obj) {
	for (const k of ['status', 'action', 'message']) {
		if (!(k in obj)) throw new Error(`AI response missing key: ${k}`);
	}
	obj.action = normalizeAction(obj.action);
	if (typeof obj.action !== 'string' || obj.action.length < 1) {
		throw new Error('AI response "action" must be a non-empty string');
	}
	if (!ACTIONS.includes(obj.action)) {
		// allow legacy action+step, will be mapped in coerceAiResponse
		const mapped = mapLegacyToNewAction(obj.action, obj.step);
		obj.action = mapped && ACTIONS.includes(mapped) ? mapped : 'ASK';
	}
	if (!['ok', 'error'].includes(obj.status)) {
		throw new Error('AI response "status" must be "ok" or "error"');
	}
	if (typeof obj.message !== 'string') {
		throw new Error('AI response "message" must be a string');
	}
	validateByFlow(obj);
	return true;
}

function safeParseJson(text) {
	const raw = String(text || '').trim();
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch (_) {}
	// Try to extract the first JSON object from the response.
	const m = raw.match(/\{[\s\S]*\}/);
	if (m && m[0]) {
		try {
			return JSON.parse(m[0]);
		} catch (_) {}
	}
	return null;
}

function repairNonJsonToDecision(rawText) {
	const action = extractActionHintFromText(rawText) || 'ASK';
	const msg = stripHistoryPrefix(rawText);
	return coerceAiResponse({
		status: 'ok',
		action,
		data: {},
		message: msg || 'Em chưa nhận được JSON hợp lệ. Anh/chị thử gửi lại giúp em nhé.'
	});
}

function getModel() {
	return String(getRuntimeConfig()?.openai?.model || '').trim() || 'gpt-4o';
}

async function buildSystemPrompt() {
	// Inline system prompt (single source).
	// The backend will provide: recent history (context) and optional KB (in future).
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
				'- ASK: chẩn đoán + hướng dẫn xử lý ONLINE theo checklist; luôn hỏi kết quả sau khi user làm; chỉ đề nghị tạo ticket khi thật sự cần.',
				'- COLLECT_INFOMATION: hỏi thêm đúng 1 trường còn thiếu (ưu tiên type → room → level → chi tiết). Nếu đã đủ dữ liệu để hướng dẫn online thì hướng dẫn luôn, chưa cần tạo ticket.',
				'- CONFIRM: tóm tắt + hỏi xác nhận',
				'- CREATE_TASK: chỉ khi user xác nhận; điền data.task đầy đủ để backend tạo, giới thiệu lại, cảm ơn và tạm biệt',
				'- END: cảm ơn + xin đánh giá',
				'',
				'[QUY TẮC THU THẬP]',
				'- KHÔNG DÙNG null. Thiếu dữ liệu thì để chuỗi rỗng "".',
				'- Nếu cần hỏi thêm: CHỈ hỏi 1 câu; data.missing_fields chỉ chứa 1 field đang hỏi.',
				'- Khi đã thu thập đủ thông tin tạo task, list thông tin đã thu thập và gửi cho user xác nhận.',
				'- ƯU TIÊN GIẢI QUYẾT ONLINE: luôn đưa 3-7 bước xử lý tại chỗ (checklist) trước.',
				'- CHỈ TẠO TICKET KHI CẦN THIẾT: chỉ đi tới CONFIRM/CREATE_TASK khi (a) sự cố cần hỗ trợ trực tiếp/không thể xử lý online, hoặc (b) user đã làm theo checklist nhưng vẫn lỗi, hoặc (c) user yêu cầu tạo ticket.',
				'- TUYỆT ĐỐI KHÔNG đòi tạo ticket ngay từ đầu nếu chưa thử hướng dẫn online (trừ khi user yêu cầu hoặc lỗi nguy cấp).',
				'- Luôn tự đọc lại lịch sử chat để hiểu user đã nói gì, thu thập được thông tin gì, tránh hỏi lại thông tin cũ.',
				'',
				'[suggestions]',
				'- data.suggestions: CHỈ dùng khi bạn đưa ra lựa chọn rẽ nhánh.',
				'- Mỗi suggestion là đúng 1 option ngắn cố gắng 2 3 từ để user bấm gửi nhanh.',
				'',
				'[learning]',
				'- Nếu bạn phát hiện kiến thức mới (case mới, lỗi mới, giải pháp mới) thì trả về data.learning để server lưu thêm.',
				'- Mỗi object: { "id": "...", "topic": "...", "keywords": "...", "desc": "...", "solution": "..." }'
			].join('\n')
		}
	];
}

async function callAssistant(messages) {
	const model = getModel();
	const { answer, usage, completion, duration } = await callChatAPI({ model, input: messages });
	return {
		answer: String(answer || '').trim(),
		meta: {
			model: completion?.model || model,
			usage: usage || null,
			duration: typeof duration === 'number' ? `${duration}ms` : null
		}
	};
}

async function decide(userPrompt, context = []) {
	const sys = await buildSystemPrompt();
	const messages = [...sys, ...(Array.isArray(context) ? context : []), { role: 'user', content: String(userPrompt || '') }];

	// 1) First attempt
	let first;
	try {
		first = await callAssistant(messages);
		const parsed = safeParseJson(first.answer);
		if (!parsed) throw Object.assign(new Error('AI returned non-JSON response'), { raw_ai_content: first.answer });
		validateAiResponse(parsed);
		const out = coerceAiResponse(parsed);
		out._ai_meta = first.meta;
		return out;
	} catch (err) {
		const msg = String(err?.message || '');
		const isFormatErr =
			msg.includes('AI returned non-JSON response') ||
			msg.includes('AI response missing key') ||
			msg.includes('AI response "action"') ||
			msg.includes('AI response "status"') ||
			msg.includes('AI response "message"') ||
			msg.includes('AI response "data"') ||
			msg.includes('For action CREATE_TASK');
		if (!isFormatErr) throw err;

		// 2) Formatter retry once
		const raw = String(err?.raw_ai_content || first?.answer || '').slice(0, 45000);
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
						'{"status":"ok|error","action":"OPEN|ASK|COLLECT_INFOMATION|CONFIRM|CREATE_TASK|END","data":{"task":{"title":"","description":"","type":"","room":"","level":"high|medium|low","deadline":""},"missing_fields":[],"suggestions":["","",""],"learning":[]},"message":""}'
				},
				{ role: 'user', content: `INPUT (raw AI output to convert):\n${raw}` }
			];
			const fixed = await callAssistant(fixMessages);
			const fixedParsed = safeParseJson(fixed.answer);
			if (!fixedParsed) throw new Error('JSON formatter returned non-JSON');
			validateAiResponse(fixedParsed);
			const out = coerceAiResponse(fixedParsed);
			out._raw_ai_content = raw;
			out._format_fixed = true;
			out._ai_meta = fixed.meta;
			if (!String(out?.message || '').trim()) out.message = stripHistoryPrefix(raw) || 'Em xin phép hỏi lại cho chắc nha.';
			return out;
		} catch (_) {
			const repaired = repairNonJsonToDecision(raw);
			repaired._raw_ai_content = raw;
			repaired._invalid_format = true;
			repaired._ai_meta = first?.meta || null;
			return repaired;
		}
	}
}

module.exports = {
	TASK_FIELDS,
	ACTIONS,
	decide,
	buildSystemPrompt
};

