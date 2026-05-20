import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const sourcePath = path.join(dataDir, 'cao-rang-faq-import-source.txt');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

function cleanCell(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/^"+|"+$/g, '')
    .trim();
}

function fixTypos(text) {
  return text
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .replace(/\btiẽng\b/gi, 'tiếng')
    .trim();
}

function toLogicalRows(raw) {
  const physical = raw.replace(/\r/g, '').split('\n');
  const logical = [];
  let buf = '';
  for (const line of physical) {
    if (/^\d+\t/.test(line)) {
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
  const m = line.match(/^(\d+)\t([\s\S]*)$/);
  if (!m) return null;
  const parts = m[2].split('\t');
  if (parts.length < 2) return null;

  const question = cleanCell(parts[0]);
  let knowledge = '';
  let sales = '';

  if (parts.length === 2) {
    knowledge = cleanCell(parts[1]);
  } else {
    knowledge = cleanCell(parts.slice(1, -1).join('\t'));
    sales = cleanCell(parts[parts.length - 1]);
  }

  return {
    stt: Number(m[1]),
    question,
    knowledge: fixTypos(knowledge),
    sales: fixTypos(sales),
  };
}

function buildAnswer(knowledge, sales) {
  if (knowledge && sales) {
    return `**Kiến thức:**\n\n${knowledge}\n\n**Tư vấn / bán hàng:**\n\n${sales}`;
  }
  if (knowledge) return knowledge;
  if (sales) return sales;
  return 'Vui lòng đến thăm khám để bác sĩ tư vấn và xây dựng phác đồ vệ sinh răng miệng phù hợp.';
}

const raw = fs.readFileSync(sourcePath, 'utf8');
const rows = toLogicalRows(raw).map(parseRow).filter(Boolean).sort((a, b) => a.stt - b.stt);

if (rows.length !== 86) {
  console.error('Expected 86 rows, got', rows.length);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
if (data.some((x) => /^LAYCAORANG-\d+$/.test(String(x.id)))) {
  console.error('Refusing to run: LAYCAORANG-<số> entries already exist.');
  process.exit(1);
}

for (const row of rows) {
  data.push({
    id: `LAYCAORANG-${String(row.stt).padStart(3, '0')}`,
    category: 'Lay cao rang',
    question: row.question,
    answer: buildAnswer(row.knowledge, row.sales),
    keywords: `lay cao rang;cao rang;vôi rang;laycaorang-${String(row.stt).padStart(3, '0')}`,
    conditions: '',
    channel_scope: 'all',
    priority: 4,
    effective_from: '2026-01-01',
    effective_to: '',
    status: 'active',
  });
}

fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Appended', rows.length, 'LAYCAORANG entries');
