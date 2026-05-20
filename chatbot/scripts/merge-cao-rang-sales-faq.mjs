import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const sourcePath = path.join(dataDir, 'cao-rang-sales-faq-import-source.txt');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

function cleanCell(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/^"+|"+$/g, '')
    .trim();
}

function normalizeText(value) {
  return cleanCell(value)
    .replace(/thức ưn/gi, 'thức ăn')
    .replace(/vôi hoá/gi, 'vôi hóa')
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .trim();
}

function toLogicalRows(raw) {
  const physical = raw.replace(/\r/g, '').split('\n');
  const logical = [];
  let buffer = '';
  for (const line of physical) {
    if (/^\s*\d+\t/.test(line)) {
      if (buffer) logical.push(buffer);
      buffer = line;
    } else if (buffer) {
      buffer += `\n${line}`;
    }
  }
  if (buffer) logical.push(buffer);
  return logical;
}

function parseRow(line) {
  const m = line.match(/^\s*(\d+)\t([\s\S]*)$/);
  if (!m) return null;
  const stt = Number(m[1]);
  const parts = m[2].split('\t');

  const salesQuestion = normalizeText(parts[0] || '');
  const expertQuestion = normalizeText(parts[1] || '');
  const answer = normalizeText(parts.slice(2).join('\t'));
  const question = salesQuestion || expertQuestion;

  if (!question) return null;

  return {
    stt,
    question,
    answer: answer || `Vui lòng thăm khám để bác sĩ tư vấn chi tiết cho câu hỏi: "${question}".`,
  };
}

const raw = fs.readFileSync(sourcePath, 'utf8');
const rows = toLogicalRows(raw).map(parseRow).filter(Boolean).sort((a, b) => a.stt - b.stt);
const uniqueRows = Array.from(new Map(rows.map((row) => [row.stt, row])).values()).sort((a, b) => a.stt - b.stt);

const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
if (data.some((item) => String(item.id).startsWith('LAYCAORANG-SALE-'))) {
  console.error('Refusing to run: LAYCAORANG-SALE-* entries already exist.');
  process.exit(1);
}

for (const row of uniqueRows) {
  data.push({
    id: `LAYCAORANG-SALE-${String(row.stt).padStart(3, '0')}`,
    category: 'Lay cao rang',
    question: row.question,
    answer: row.answer,
    keywords: `lay cao rang;cao rang;sales;laycaorang-sale-${String(row.stt).padStart(3, '0')}`,
    conditions: '',
    channel_scope: 'all',
    priority: 4,
    effective_from: '2026-01-01',
    effective_to: '',
    status: 'active',
  });
}

fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Appended', uniqueRows.length, 'LAYCAORANG-SALE entries.');
console.log('STT range:', uniqueRows[0]?.stt, '->', uniqueRows[uniqueRows.length - 1]?.stt);
