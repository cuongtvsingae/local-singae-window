import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const sourcePath = path.join(dataDir, 'implant-faq-import-source.txt');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

function cleanCell(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/^"+|"+$/g, '')
    .trim();
}

function normalizeText(s) {
  return cleanCell(s)
    .replace(/\bDa,\b/g, 'Dạ,')
    .replace(/\bipl\b/gi, 'implant')
    .replace(/\bimlpant\b/gi, 'implant')
    .replace(/\b6th\/1\b/gi, '6 tháng/1')
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .trim();
}

function toLogicalRows(raw) {
  const physical = raw.replace(/\r/g, '').split('\n');
  const logical = [];
  let buf = '';
  for (const line of physical) {
    if (/^\s*\d+\t/.test(line)) {
      if (buf) logical.push(buf);
      buf = line;
    } else if (buf) {
      buf += `\n${line}`;
    }
  }
  if (buf) logical.push(buf);
  return logical;
}

function parseRow(line) {
  const m = line.match(/^\s*(\d+)\t([\s\S]*)$/);
  if (!m) return null;
  const stt = Number(m[1]);
  const parts = m[2].split('\t');

  const c1 = normalizeText(parts[0] || '');
  const c2 = normalizeText(parts[1] || '');
  const c3 = normalizeText(parts.slice(2).join('\t'));

  const question = c1 || c2;
  let answer = c3;
  if (!answer && c1 && c2 && c2 !== question) answer = c2;

  if (!question) return null;

  return { stt, question, answer };
}

function fallbackAnswer(question) {
  return `Vui lòng thăm khám và chụp CT để bác sĩ tư vấn chi tiết cho trường hợp "${question}".`;
}

const raw = fs.readFileSync(sourcePath, 'utf8');
const rows = toLogicalRows(raw)
  .map(parseRow)
  .filter(Boolean)
  .sort((a, b) => a.stt - b.stt);

const dedup = new Map();
for (const r of rows) dedup.set(r.stt, r);
const uniqueRows = Array.from(dedup.values()).sort((a, b) => a.stt - b.stt);

const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
if (data.some((x) => String(x.id).startsWith('IMPLANT-'))) {
  console.error('Refusing to run: IMPLANT-* entries already exist.');
  process.exit(1);
}

for (const row of uniqueRows) {
  data.push({
    id: `IMPLANT-${String(row.stt).padStart(3, '0')}`,
    category: 'Implant',
    question: row.question,
    answer: row.answer || fallbackAnswer(row.question),
    keywords: `implant;trong rang implant;implant-${String(row.stt).padStart(3, '0')}`,
    conditions: '',
    channel_scope: 'all',
    priority: 4,
    effective_from: '2026-01-01',
    effective_to: '',
    status: 'active',
  });
}

fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Appended', uniqueRows.length, 'IMPLANT entries.');
console.log('STT range:', uniqueRows[0]?.stt, '->', uniqueRows[uniqueRows.length - 1]?.stt);
