const axios = require('axios');
const config = require('./config');

function csvToRows(csvText) {
	const rows = [];
	const lines = String(csvText || '').split(/\r?\n/);
	for (const line of lines) {
		if (line.trim() === '') continue;
		// simple CSV split; acceptable for our simple sheets
		const cols = [];
		let cur = '';
		let inQ = false;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === '"') {
				if (inQ && line[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQ = !inQ;
				}
			} else if (ch === ',' && !inQ) {
				cols.push(cur);
				cur = '';
			} else {
				cur += ch;
			}
		}
		cols.push(cur);
		rows.push(cols.map((c) => c.trim()));
	}
	return rows;
}

async function fetchSheetCsvByGid(gid) {
	const id = config.sheets.id;
	if (!id || !gid) return [];
	const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gid)}`;
	const res = await axios.get(url, { responseType: 'text' });
	return csvToRows(res.data || '');
}

async function fetchSheetValuesByName(sheetName, range /* optional */) {
	const id = config.sheets.id;
	if (!id) throw new Error('SHEETS_ID_MISSING');
	if (!sheetName) return [];
	// gviz JSON with optional range for precise reads (e.g., A1)
	const params = new URLSearchParams({ tqx: 'out:json', sheet: sheetName });
	if (range) params.set('range', range);
	const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${params.toString()}`;
	const res = await axios.get(url, { responseType: 'text' });
	if (res.status !== 200) throw new Error(`SHEETS_HTTP_${res.status}`);
	const txt = String(res.data || '');
	const body = txt.replace(/^[^{]*setResponse\(/, '').replace(/\)\s*;?\s*$/, '');
	const json = JSON.parse(body);
	const table = json?.table;
	const rows = [];
	for (const r of table?.rows || []) {
		const cols = (r.c || []).map((c) => (c && c.v !== null && c.v !== undefined ? String(c.v) : ''));
		rows.push(cols);
	}
	return rows;
}

async function readPromptA1() {
	// Read precisely A1 from sheet "promt"
	const rows = await fetchSheetValuesByName('promt', 'A1');
	const first = rows?.[0]?.[0] || '';
	return String(first || '').trim();
}

async function postRowsViaAppsScript(sheet, rows) {
	const url = config.sheets.appsScriptUrl;
	if (!url) return { ok: false, message: 'No Apps Script URL configured' };
	try {
		const res = await axios.post(url, { action: 'appendRows', sheet, rows });
		return { ok: true, data: res.data };
	} catch (e) {
		return { ok: false, message: e?.message || 'Apps Script POST failed' };
	}
}

async function seedSheetsSamples() {
	// Best-effort: only when Apps Script URL configured
	if (!config.sheets.appsScriptUrl) return { ok: false, reason: 'apps_script_missing' };
	// chat_messages
	let existing = [];
	try { existing = await fetchSheetValuesByName('chat_messages'); } catch {}
	if (!existing || existing.length < 2) {
		const chatSamples = [
			// printer
			{ topic: 'printer', user: 'Máy in không in được', assistant: 'Anh/chị đang ở phòng nào?\n- Kiểm tra queue và kết nối\n- Tạo ticket nếu cần' },
			{ topic: 'printer', user: 'In bị kẹt giấy liên tục', assistant: 'Máy in model gì, ở phòng nào?\n- Kiểm tra giấy/mực\n- Làm sạch roller\n- Tạo ticket nếu tái diễn' },
			{ topic: 'printer', user: 'Máy in báo offline', assistant: 'Phòng nào, kết nối LAN/USB?\n- Ping IP máy in\n- Khởi động lại spooler' },
			// network
			{ topic: 'network', user: 'Không vào được web công việc', assistant: 'Phòng nào? Có mã lỗi?\n- Kiểm tra LAN/WiFi, DNS\n- Dùng 4G so sánh' },
			{ topic: 'network', user: 'WiFi yếu ở phòng 302', assistant: 'Tín hiệu RSSI?\n- Đổi vị trí AP\n- Kiểm tra số client' },
			// office
			{ topic: 'office-excel', user: 'Excel mở file chậm', assistant: 'Username máy? File cụ thể?\n- Tắt add-in nặng\n- Sửa Office nếu cần' },
			{ topic: 'office-outlook', user: 'Outlook gửi mail bị treo', assistant: 'Username email?\n- Kiểm tra PST/OST dung lượng\n- Sửa profile' },
			// crm/tele
			{ topic: 'crm-getfly', user: 'GETFLY không đăng nhập được', assistant: 'Username GETFLY?\n- Kiểm tra trạng thái dịch vụ\n- Reset mật khẩu nếu cần' },
			{ topic: 'simly', user: 'SIMLY chạy rất chậm', assistant: 'Phòng nào, trang/bước nào chậm?\n- Kiểm tra mạng nội bộ và trình duyệt' },
			{ topic: 'omicall', user: 'OMICALL không hiện popup', assistant: 'Tài khoản OMICALL? Trình duyệt nào?\n- Kiểm tra extension và quyền thông báo' },
		];
		await postRowsViaAppsScript('chat_messages', [Object.keys(chatSamples[0]), ...chatSamples.map((r) => Object.values(r))]);
	}
	// knowlege
	let existingK = [];
	try { existingK = await fetchSheetValuesByName('knowlege'); } catch {}
	if (!existingK || existingK.length < 2) {
		const knowlege = [
			{ key: 'CRM_GETFLY_URL', value: 'https://app.getflycrm.com', notes: 'CRM chính', link: 'https://app.getflycrm.com' },
			{ key: 'SIMLY_URL', value: 'https://simly.vn', notes: 'CRM SIMLY', link: 'https://simly.vn' },
			{ key: 'OMICALL_DASHBOARD', value: 'https://my.omicall.com', notes: 'Tổng đài', link: 'https://my.omicall.com' },
			{ key: 'LAN_PRINTER_IP_201', value: '192.168.1.201', notes: 'Máy in tầng 2', link: '' },
			{ key: 'DNS_PRIMARY', value: '8.8.8.8', notes: 'Fallback DNS', link: '' },
		];
		await postRowsViaAppsScript('knowlege', [Object.keys(knowlege[0]), ...knowlege.map((r) => Object.values(r))]);
	}
	return { ok: true };
}

async function appendLogs(entries) {
	// entries: [{ when, type, value }]
	const rows = (entries || []).map((e) => [e.when, e.type, e.value]);
	return await postRowsViaAppsScript('LOGS', rows);
}

async function appendLearning(items) {
	// items: [{ id, topic, keywords, desc, solution }]
	const rows = (items || []).map((it) => [
		String(it?.id || '').trim(),
		String(it?.topic || '').trim(),
		String(it?.keywords || '').trim(),
		String(it?.desc || '').trim(),
		String(it?.solution || '').trim(),
	]);
	return await postRowsViaAppsScript('learning', rows);
}

async function ensureChatSamplesGrowth(hintText) {
	if (!config.sheets.appsScriptUrl) return { ok: false, reason: 'apps_script_missing' };
	const rows = await fetchSheetValuesByName('chat_messages');
	if (rows.length >= 52) return { ok: true, skipped: true };
	const header = rows?.[0] || ['topic', 'user', 'assistant'];
	const text = String(hintText || '').slice(0, 140);
	const mk = (topic, user, assistant) => {
		const out = [];
		const map = { topic, user, assistant };
		for (let i = 0; i < header.length; i++) out.push(map[header[i]] ?? '');
		return out;
	};
	const samples = [
		mk('auto-log', text || 'Người dùng hỏi về sự cố chung', 'Hỏi phòng/khu vực và mức độ gấp.\n- Gợi ý bước xử lý\n- Tạo ticket nếu cần'),
		mk('auto-log-network', 'Không vào được web hoặc ứng dụng', 'Hỏi phòng và mã lỗi.\n- Kiểm tra LAN/WiFi, DNS\n- Tạo ticket nếu ảnh hưởng công việc'),
	];
	const toAppend = rows.length < 10 ? samples : samples.slice(0, 1);
	return await postRowsViaAppsScript('chat_messages', [header, ...toAppend]);
}

module.exports = {
	fetchSheetValuesByName,
	fetchSheetCsvByGid,
	readPromptA1,
	postRowsViaAppsScript,
	seedSheetsSamples,
	appendLogs,
	appendLearning,
	ensureChatSamplesGrowth,
};

