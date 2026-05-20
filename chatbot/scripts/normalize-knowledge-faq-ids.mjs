/**
 * One-shot: đổi id trong knowledge-rang-su-faq.json sang tiền tố theo chủ đề (dễ grep).
 * Chạy: node tools/chatbot/scripts/normalize-knowledge-faq-ids.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

function pad3(num) {
  return String(num).padStart(3, '0');
}

function mapId(oldId) {
  const s = String(oldId);
  let m = s.match(/^FAQ-(\d+)$/);
  if (m) return `RANGSU-${pad3(m[1])}`;
  m = s.match(/^NIENG-(\d+)$/);
  if (m) return `CHINHNHA-${pad3(m[1])}`;
  m = s.match(/^CAORANG-(\d+)$/);
  if (m) return `LAYCAORANG-${pad3(m[1])}`;
  m = s.match(/^CAORANGSALE-(\d+)$/);
  if (m) return `LAYCAORANG-SALE-${pad3(m[1])}`;
  m = s.match(/^HANRANGSALE-(\d+)$/);
  if (m) return `HANRANG-${pad3(m[1])}`;
  return s;
}

function migrateKeywords(oldId, keywords) {
  let k = String(keywords ?? '');
  if (/^FAQ-/.test(oldId)) {
    k = k.replace(/(^|;)faq-(\d+)/gi, (_, pre, num) => `${pre}rangsu-${num}`);
  }
  if (/^NIENG-/.test(oldId)) {
    k = k.replace(/(^|;)nieng-(\d+)/gi, (_, pre, num) => `${pre}chinhnha-${num}`);
  }
  if (/^CAORANG-/.test(oldId)) {
    k = k.replace(/(^|;)caorang-(\d+)/gi, (_, pre, num) => `${pre}laycaorang-${num}`);
  }
  if (/^CAORANGSALE-/.test(oldId)) {
    k = k.replace(/(^|;)caorangsale-(\d+)/gi, (_, pre, num) => `${pre}laycaorang-sale-${num}`);
  }
  if (/^HANRANGSALE-/.test(oldId)) {
    k = k.replace(/(^|;)hanrangsale-(\d+)/gi, (_, pre, num) => `${pre}hanrang-${num}`);
  }
  return k;
}

const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
const seen = new Set();
const next = [];

for (const row of data) {
  const oldId = row.id;
  const newId = mapId(oldId);
  if (seen.has(newId)) {
    console.error('Duplicate id after map:', newId, 'from', oldId);
    process.exit(1);
  }
  seen.add(newId);
  next.push({
    ...row,
    id: newId,
    keywords: migrateKeywords(oldId, row.keywords),
  });
}

fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
console.log('Updated', next.length, 'entries in', targetPath);
