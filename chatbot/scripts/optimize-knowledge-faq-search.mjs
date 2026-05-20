import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const targetPath = path.join(dataDir, 'knowledge-rang-su-faq.json');

const CONFIG_BY_PREFIX = {
  RANGSU: {
    category: 'Rang su',
    questionPrefix: 'Răng sứ',
    markers: ['rang su', 'boc su', 'boc rang su', 'dan su', 'veneer', 'mat dan su'],
    keywords: [
      'rang su',
      'răng sứ',
      'rangsu',
      'boc rang su',
      'bọc răng sứ',
      'dan su',
      'dán sứ',
      'veneer',
      'mat dan su',
      'mặt dán sứ'
    ]
  },
  CHINHNHA: {
    category: 'Chinh nha',
    questionPrefix: 'Chỉnh nha',
    markers: ['chinh nha', 'nieng rang', 'mac cai', 'invisalign', 'khay trong suot'],
    keywords: [
      'chinh nha',
      'chỉnh nha',
      'nieng rang',
      'niềng răng',
      'mac cai',
      'mắc cài',
      'invisalign',
      'khay trong suot',
      'khay trong suốt'
    ]
  },
  LAYCAORANG: {
    category: 'Lay cao rang',
    questionPrefix: 'Lấy cao răng',
    markers: ['lay cao rang', 'cao voi rang', 'danh bong rang'],
    keywords: [
      'lay cao rang',
      'lấy cao răng',
      'cao voi rang',
      'cao vôi răng',
      'cao rang',
      'đánh bóng răng',
      'danh bong rang'
    ]
  },
  IMPLANT: {
    category: 'Implant',
    questionPrefix: 'Implant',
    markers: ['implant', 'trong rang', 'cay ghep', 'cay implant', 'tru implant'],
    keywords: [
      'implant',
      'trong rang implant',
      'trồng răng implant',
      'cay implant',
      'cấy implant',
      'tru implant',
      'trụ implant',
      'trong rang',
      'trồng răng'
    ]
  },
  HANRANG: {
    category: 'Han rang',
    questionPrefix: 'Hàn răng',
    markers: ['han rang', 'tram rang', 'tram', 'sau rang'],
    keywords: [
      'han rang',
      'hàn răng',
      'tram rang',
      'trám răng',
      'tram',
      'trám',
      'sau rang',
      'sâu răng'
    ]
  },
  VIEMLOI: {
    category: 'Dieu tri viem loi',
    questionPrefix: 'Viêm lợi',
    markers: ['viem loi', 'viem nha chu', 'chay mau chan rang', 'tui nha chu'],
    keywords: [
      'viem loi',
      'viêm lợi',
      'viem nha chu',
      'viêm nha chu',
      'chay mau chan rang',
      'chảy máu chân răng',
      'tui nha chu',
      'túi nha chu'
    ]
  },
  BANGGIASG: {
    category: 'Gia',
    questionPrefix: 'Bảng giá Singae',
    markers: ['bang gia', 'gia dich vu', 'gia nha khoa', 'uu dai', 'bao hanh'],
    keywords: [
      'bang gia',
      'bảng giá',
      'gia dich vu',
      'giá dịch vụ',
      'gia nha khoa',
      'giá nha khoa',
      'gia niem yet',
      'giá niêm yết',
      'uu dai',
      'ưu đãi',
      'bang gia singae',
      'bảng giá singae',
      'singae',
      'final sg',
      'singae dental'
    ]
  }
};

const BANG_GIA_TITLES = {
  'BANGGIASG-001': 'Tài liệu Singae - mục lục tổng quan',
  'BANGGIASG-002': 'Tài liệu Singae - thương hiệu và cam kết hoàn tiền',
  'BANGGIASG-003': 'Tài liệu Singae - giấy phép hoạt động và bác sĩ implant',
  'BANGGIASG-004': 'Tài liệu Singae - đội ngũ bác sĩ implant',
  'BANGGIASG-005': 'Tài liệu Singae - bác sĩ chỉnh nha và ca khách hàng implant',
  'BANGGIASG-006': 'Tài liệu Singae - ca khách hàng răng sứ, chỉnh nha và cam kết minh bạch',
  'BANGGIASG-007': 'Tài liệu Singae - phòng labo và quy trình implant 18 bước phần 1',
  'BANGGIASG-008': 'Tài liệu Singae - quy trình implant 18 bước và răng sứ 22 bước phần 1',
  'BANGGIASG-009': 'Tài liệu Singae - quy trình răng sứ 22 bước phần 2',
  'BANGGIASG-010': 'Tài liệu Singae - quy trình răng sứ 22 bước và chỉnh nha 12 bước',
  'BANGGIASG-011':
    'Bảng giá trồng răng implant đơn lẻ Singae (full; gộp từ BANGGIASG-012)',
  'BANGGIASG-013': 'Bảng giá trồng răng Mini Implant Singae',
  'BANGGIASG-014':
    'Bảng giá implant toàn hàm All-on-4/All-on-6 Singae (Combo 1–3; gộp từ BANGGIASG-015, BANGGIASG-016)',
  'BANGGIASG-024':
    'Bảng giá All-on Singae có category_title (4/6 trụ, Combo 1–3), price_options và all_on_price_categories',
  'BANGGIASG-017':
    'Bảng giá vật tư lẻ implant toàn hàm Singae (price_options, full_arch_material_categories)',
  'BANGGIASG-018':
    'Bảng giá răng sứ + chỉnh nha I–III Singae (price_options, price_categories; răng sứ 8%)',
  'BANGGIASG-019':
    'Bảng giá chỉnh nha IV–VI Singae (price_options, price_categories; Invisalign & mắc cài lẻ)',
  'BANGGIASG-020':
    'Bảng giá tổng quát Singae khám/lấy cao/tuỷ/trám (price_options, price_categories; 5%)',
  'BANGGIASG-021': 'Bảng giá tổng quát Singae nhổ răng IV phần 1 (price_options, 5%)',
  'BANGGIASG-022':
    'Bảng giá tổng quát Singae IV tiếp, tiểu phẫu, tẩy trắng, DV khác (price_options, price_categories)',
  'BANGGIASG-025':
    'Chính sách ưu đãi Singae theo loại DV (promotion_policies.policy_rows, promotion_policy_categories)'
};

const DROP_KEYWORDS = new Set(['sales']);
const FALLBACK_ANSWERS = {
  'RANGSU-025':
    'Thông thường giá niêm yết răng sứ chưa bao gồm các chi phí điều trị bệnh lý phát sinh như chữa tủy, xử lý sâu răng hoặc can thiệp thêm nếu có. Bác sĩ cần thăm khám trực tiếp để báo chi tiết phần phát sinh trước khi thực hiện.',
  'RANGSU-055':
    'Tùy từng dòng sứ và chính sách áp dụng, thẻ bảo hành có thể do nha khoa phát hành, do hãng sứ phát hành hoặc có cả hai. Khi làm dịch vụ, nên yêu cầu ghi rõ tên dòng sứ, thời hạn bảo hành và đơn vị chịu trách nhiệm bảo hành.',
  'RANGSU-056':
    'Để kiểm tra thẻ bảo hành có thật hay không, nên đối chiếu tên dòng sứ, mã sản phẩm hoặc serial, thời hạn bảo hành, dấu xác nhận của nha khoa và khả năng tra cứu thông tin với hãng nếu có. Khi cần, có thể yêu cầu xem phôi sứ, hóa đơn hoặc thông tin bảo hành đi kèm ngay lúc bàn giao.'
};

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^"+|"+$/g, '');
}

function normalizeForSearch(value) {
  return stripAccents(cleanText(value))
    .toLowerCase()
    .replace(/[^0-9a-z\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseKeywords(value) {
  return String(value || '')
    .split(/[;,|]/g)
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item) => !DROP_KEYWORDS.has(normalizeForSearch(item)));
}

function stripKnownQuestionPrefix(value) {
  return cleanText(value).replace(
    /^(rang su|răng sứ|chinh nha|chỉnh nha|lay cao rang|lấy cao răng|han rang|hàn răng|viem loi|viêm lợi|implant)\s*:\s*/i,
    ''
  );
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const item = cleanText(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildQuestion(prefix, question, id) {
  const baseQuestion = stripKnownQuestionPrefix(question);
  if (prefix === 'BANGGIASG') return BANG_GIA_TITLES[id] || baseQuestion;

  const config = CONFIG_BY_PREFIX[prefix];
  if (!config) return baseQuestion;

  const normalizedQuestion = normalizeForSearch(baseQuestion);
  const hasContext = config.markers.some((marker) => normalizedQuestion.includes(marker));
  return hasContext ? baseQuestion : `${config.questionPrefix}: ${baseQuestion}`;
}

function buildKeywords({ id, prefix, category, question, existingKeywords }) {
  const config = CONFIG_BY_PREFIX[prefix] || null;
  const enriched = [];

  if (config) enriched.push(...config.keywords);
  enriched.push(id.toLowerCase());
  enriched.push(category);
  enriched.push(stripAccents(category));
  enriched.push(question);
  enriched.push(stripAccents(question));
  if (prefix === 'BANGGIASG') enriched.push(...existingKeywords);

  if (prefix === 'BANGGIASG' && BANG_GIA_TITLES[id]) {
    enriched.push(BANG_GIA_TITLES[id]);
    enriched.push(stripAccents(BANG_GIA_TITLES[id]));
  }

  return unique(enriched).join(';');
}

const rows = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

const next = rows.map((row) => {
  const id = String(row.id || '').trim();
  const prefix = id.split('-')[0];
  const config = CONFIG_BY_PREFIX[prefix];

  const category = config?.category || cleanText(row.category);
  const question = buildQuestion(prefix, row.question, id);

  let answer = cleanText(row.answer);
  let conditions = cleanText(row.conditions);

  if (!answer && conditions) {
    answer = conditions;
    conditions = '';
  }
  if (!answer && FALLBACK_ANSWERS[id]) answer = FALLBACK_ANSWERS[id];

  const existingKeywords = parseKeywords(row.keywords);
  const keywords = buildKeywords({
    id,
    prefix,
    category,
    question,
    existingKeywords
  });

  return {
    ...row,
    category,
    question,
    answer,
    keywords,
    conditions
  };
});

fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
console.log('Optimized search metadata for', next.length, 'knowledge entries.');
