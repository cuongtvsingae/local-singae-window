/**
 * Parse niềng-răng FAQ TSV (STT, CÂU HỎI, KIẾN THỨC, BÁN HÀNG) and append to knowledge-rang-su-faq.json.
 * Source: tools/chatbot/data/nieng-faq-import-source.txt (UTF-8, one row per line; K may contain tabs).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const sourcePath = path.join(dataDir, 'nieng-faq-import-source.txt');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

function cleanCell(s) {
  if (s == null) return '';
  let t = String(s).replace(/\r/g, '').trim();
  t = t.replace(/^"+|"+$/g, '').trim();
  t = t.replace(/\n"+$/g, '').trim();
  return t;
}

function fixTypos(text) {
  return text
    .replace(/^iai đoạn/m, 'Giai đoạn')
    .replace(/^TRong /, 'Trong ')
    .replace(/^: /, '')
    .replace(/\btú vấn\b/gi, 'tư vấn')
    .replace(/\bInvisailgn\b/g, 'Invisalign')
    .replace(/\bInvisalgn\b/g, 'Invisalign')
    .replace(/\bchưa n$/m, 'chưa niềng.')
    .replace(/^ên dùng /m, 'Nên dùng ')
    .replace(/hộp đồng/g, 'hợp đồng')
    .replace(/""\s*$/g, '')
    .replace(/\s+$/g, '');
}

function parseRow(line) {
  const m = line.match(/^(\d+)\t([\s\S]*)$/);
  if (!m) return null;
  const parts = m[2].split('\t');
  if (parts.length < 2) return null;
  const q = parts[0];
  const b = parts[parts.length - 1];
  const k = parts.slice(1, -1).join('\t');
  return {
    stt: Number(m[1], 10),
    q: cleanCell(q),
    k: fixTypos(cleanCell(k)),
    b: fixTypos(cleanCell(b)),
  };
}

function buildAnswer(k, b) {
  if (k && b) {
    return `**Kiến thức:**\n\n${k}\n\n**Tư vấn / bán hàng:**\n\n${b}`;
  }
  if (k) return k;
  if (b) return b;
  return 'Vui lòng đến thăm khám để bác sĩ Singae tư vấn chi tiết: ngoài nhổ răng, tùy ca có thể cân nhắc nong hàm, di xa hoặc mài kẽ để tạo khoảng.';
}

function toLogicalRows(raw) {
  const physical = raw.replace(/\r/g, '').split('\n');
  const logical = [];
  let buf = '';
  for (const pl of physical) {
    if (/^\d+\t/.test(pl)) {
      if (buf) logical.push(buf);
      buf = pl;
    } else if (buf) {
      buf += `\n${pl}`;
    }
  }
  if (buf) logical.push(buf);
  return logical;
}

function main() {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const logicalLines = toLogicalRows(raw).filter((l) => !/^STT\t/.test(l));
  const rows = logicalLines.map(parseRow).filter(Boolean);
  rows.sort((a, b) => a.stt - b.stt);

  const existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  const existingIds = new Set(existing.map((e) => e.id));
  if (existing.some((e) => String(e.id).startsWith('CHINHNHA-'))) {
    console.error('Refusing to run: CHINHNHA-* entries already present.');
    process.exit(1);
  }

  for (const r of rows) {
    const id = `CHINHNHA-${String(r.stt).padStart(3, '0')}`;
    if (existingIds.has(id)) {
      console.error('Duplicate id', id);
      process.exit(1);
    }
    existingIds.add(id);
    existing.push({
      id,
      category: 'Chinh nha',
      question: r.q,
      answer: buildAnswer(r.k, r.b),
      keywords: `chinh nha;nieng rang;invisalign;chinhnha-${String(r.stt).padStart(3, '0')}`,
      conditions: '',
      channel_scope: 'all',
      priority: 4,
      effective_from: '2026-01-01',
      effective_to: '',
      status: 'active',
    });
  }

  fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
  console.log('Appended', rows.length, 'CHINHNHA entries to', targetPath);
}

main();
