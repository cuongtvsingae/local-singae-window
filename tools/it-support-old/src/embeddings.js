const fs = require('fs');
const path = require('path');
const { fetchSheetValuesByName, postRowsViaAppsScript } = require('./sheets');
const config = require('./config');

const INDEX_FILE = path.resolve(__dirname, '..', 'data', 'embeddings.json');

function tokenize(text) {
	const s = String(text || '').toLowerCase();
	return s
		.replace(/[^a-z0-9\u00C0-\u1EF9\s]+/gi, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

function tf(tokens) {
	const map = Object.create(null);
	for (const t of tokens) map[t] = (map[t] || 0) + 1;
	const len = tokens.length || 1;
	for (const k in map) map[k] = map[k] / len;
	return map;
}

function cosine(a, b) {
	let dot = 0;
	let na = 0;
	let nb = 0;
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const k of keys) {
		const va = a[k] || 0;
		const vb = b[k] || 0;
		dot += va * vb;
		na += va * va;
		nb += vb * vb;
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function ensureDir(file) {
	const dir = path.dirname(file);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveIndex(index) {
	ensureDir(INDEX_FILE);
	fs.writeFileSync(INDEX_FILE, JSON.stringify(index), 'utf8');
}

function loadIndex() {
	if (!fs.existsSync(INDEX_FILE)) return null;
	try {
		return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
	} catch {
		return null;
	}
}

async function getChatMessagesRows() {
	const rows = await fetchSheetValuesByName('chat_messages');
	// Expect header
	const [header, ...data] = rows;
	if (!header || header.length < 3) return { header: ['topic', 'user', 'assistant'], rows: [] };
	return { header, rows: data };
}

async function getKnowlegeRows() {
	const rows = await fetchSheetValuesByName('knowlege');
	const [header, ...data] = rows;
	if (!header || header.length < 2) return { header: ['key', 'value', 'notes', 'link'], rows: [] };
	return { header, rows: data };
}

async function appendSamplesIfMissing() {
	if (!config.sheets.appsScriptUrl) return; // cannot write
	// chat_messages
	const cm = await getChatMessagesRows();
	if ((cm.rows || []).length < 2) {
		const chatSamples = [
			{ topic: 'printer', user: 'Máy in không in được', assistant: 'Hỏi phòng/khu vực, mức độ gấp.\n- Kiểm tra queue/kết nối\n- Tạo ticket nếu cần' },
			{ topic: 'office-excel', user: 'Excel mở file chậm', assistant: 'Hỏi username, file nào chậm.\n- Kiểm tra add-in, phiên bản Office' },
			{ topic: 'network', user: 'Không vào được web công việc', assistant: 'Hỏi phòng, mã lỗi.\n- Kiểm tra LAN/WiFi, DNS' },
		];
		await postRowsViaAppsScript('chat_messages', [Object.keys(chatSamples[0]), ...chatSamples.map((r) => Object.values(r))]);
	}
	// knowlege
	const kn = await getKnowlegeRows();
	if ((kn.rows || []).length < 2) {
		const knowlege = [
			{ key: 'CRM_GETFLY_URL', value: 'https://app.getflycrm.com', notes: 'CRM chính', link: 'https://app.getflycrm.com' },
			{ key: 'SIMLY_URL', value: 'https://simly.vn', notes: 'CRM SIMLY', link: 'https://simly.vn' },
			{ key: 'OMICALL_DASHBOARD', value: 'https://my.omicall.com', notes: 'Tổng đài', link: 'https://my.omicall.com' },
		];
		await postRowsViaAppsScript('knowlege', [Object.keys(knowlege[0]), ...knowlege.map((r) => Object.values(r))]);
	}
}

async function buildIndexFromSheets() {
	const chat = await getChatMessagesRows();
	const know = await getKnowlegeRows();
	if ((!chat.rows || chat.rows.length === 0) && (!know.rows || know.rows.length === 0)) {
		throw new Error('SHEETS_EMPTY');
	}
	// Compose documents
	const docs = [];
	const hChat = chat.header;
	const hKnow = know.header;
	for (const r of chat.rows) {
		const obj = Object.fromEntries(r.map((v, i) => [hChat[i] || `c${i}`, v]));
		docs.push({ id: `chat:${obj.topic || ''}:${obj.user || ''}`.slice(0, 200), text: `${obj.topic || ''}\n${obj.user || ''}\n${obj.assistant || ''}`.trim() });
	}
	for (const r of know.rows) {
		const obj = Object.fromEntries(r.map((v, i) => [hKnow[i] || `k${i}`, v]));
		docs.push({ id: `know:${obj.key || ''}`.slice(0, 200), text: `${obj.key || ''}\n${obj.value || ''}\n${obj.notes || ''}\n${obj.link || ''}`.trim() });
	}
	// TF-IDF
	const tokenized = docs.map((d) => tokenize(d.text));
	const tfs = tokenized.map((t) => tf(t));
	const df = Object.create(null);
	for (const toks of tokenized) {
		const uniq = new Set(toks);
		for (const k of uniq) df[k] = (df[k] || 0) + 1;
	}
	const N = docs.length;
	const idf = Object.create(null);
	for (const k in df) idf[k] = Math.log((N + 1) / (df[k] + 1)) + 1;
	const vectors = tfs.map((m) => {
		const v = Object.create(null);
		for (const k in m) v[k] = m[k] * idf[k];
		return v;
	});
	const index = {
		built_at: new Date().toISOString(),
		doc_count: N,
		idf,
		docs,
		vectors,
	};
	return index;
}

function searchTopK(index, query, k = 6) {
	if (!index || !index.idf) return [];
	const qv = tf(tokenize(query || ''));
	// apply idf
	for (const k2 in qv) qv[k2] = qv[k2] * (index.idf[k2] || 0);
	const scores = index.vectors.map((vec, i) => ({ i, s: cosine(vec, qv) }));
	scores.sort((a, b) => b.s - a.s);
	const out = [];
	for (let j = 0; j < Math.min(k, scores.length); j++) {
		if (scores[j].s <= 0) break;
		const d = index.docs[scores[j].i];
		out.push({ id: d.id, text: d.text, score: scores[j].s });
	}
	return out;
}

async function ensureEmbeddingsReadyOrFail() {
	if (!config.sheets.id) throw new Error('SHEETS_ID missing');

	// 0) If cached embeddings already exist -> use immediately (allow server to start)
	const cached = loadIndex();
	if (cached && Array.isArray(cached.docs) && cached.docs.length > 0) {
		return true;
	}

	// Helper sleep
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	// 1) Try up to 8 attempts (≈8–40s) to fetch/build embeddings before failing hard
	let lastErr = null;
	for (let attempt = 0; attempt < 8; attempt++) {
		try {
			// If sheets have rows -> build; if empty -> attempt append samples then build
			let cm = [];
			let kn = [];
			try {
				cm = (await getChatMessagesRows()).rows || [];
				kn = (await getKnowlegeRows()).rows || [];
			} catch (e) {
				throw new Error(`SHEETS_READ_FAIL: ${e?.message || e}`);
			}
			if (cm.length < 1 && kn.length < 1) {
				if (!config.sheets.appsScriptUrl) throw new Error('SHEETS_EMPTY and no Apps Script URL to seed');
				await appendSamplesIfMissing();
				// re-read
				cm = (await getChatMessagesRows()).rows || [];
				kn = (await getKnowlegeRows()).rows || [];
				if (cm.length < 1 && kn.length < 1) throw new Error('SHEETS_STILL_EMPTY_AFTER_SEED');
			}
			// build and save
			const index = await buildIndexFromSheets();
			saveIndex(index);
			return true;
		} catch (e) {
			lastErr = e;
			// backoff: 1s,2s,3s,...
			// eslint-disable-next-line no-await-in-loop
			await sleep(1000 + attempt * 1000);
		}
	}
	throw new Error(`EMBEDDINGS_BOOT_FAIL: ${lastErr?.message || lastErr}`);
}

module.exports = {
	loadIndex,
	saveIndex,
	buildIndexFromSheets,
	searchTopK,
	ensureEmbeddingsReadyOrFail,
};

