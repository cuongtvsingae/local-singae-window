"use strict";

const fs = require("fs");
const path = require("path");

const KB_FILE = path.resolve(__dirname, "../../data/knowledge-rang-su-faq.json");
const MAX_REASONABLE_PRICE = 200_000_000;

function foldVietnamese(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function normalizeWhitespace(input) {
  return String(input || "")
    .replace(/\u00A0/g, " ")
    .replace(/(\d)\s+(?=[\d.,])/g, "$1")
    .replace(/([.,])\s+(?=\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function preprocessForMoneyScan(input) {
  return String(input || "")
    .replace(/\u00A0/g, " ")
    .replace(/([\p{L}])(\d)/gu, "$1 $2")
    .replace(/(\d)([\p{L}])/gu, "$1 $2")
    .replace(/\s*([.,])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyNumber(raw, unitHint = "", { allowShort = false } = {}) {
  const unit = foldVietnamese(unitHint || "");
  const compact = String(raw || "").replace(/\s+/g, "");
  if (!compact) return null;

  const isDecimal = /^\d+[.,]\d{1,2}$/.test(compact);
  const decimalValue = Number(compact.replace(",", "."));
  const integerValue = Number(compact.replace(/[.,]/g, ""));
  if (!Number.isFinite(decimalValue) && !Number.isFinite(integerValue)) return null;

  if (unit === "trieu" || unit === "tr") {
    const base = isDecimal && Number.isFinite(decimalValue) ? decimalValue : integerValue;
    const v = Math.round(base * 1_000_000);
    return v > 0 ? v : null;
  }
  if (unit === "k" || unit === "nghin" || unit === "ngan") {
    const base = isDecimal && Number.isFinite(decimalValue) ? decimalValue : integerValue;
    const v = Math.round(base * 1_000);
    return v > 0 ? v : null;
  }
  const v = integerValue;
  if (!Number.isFinite(v) || v <= 0) return null;
  if (!allowShort && v < 50_000) return null;
  return v;
}

function isPricingRelevant(question, answer, category) {
  const merged = foldVietnamese(`${question || ""}\n${answer || ""}\n${category || ""}`);
  if (foldVietnamese(category) === "gia") return true;
  return /\b(gia|chi phi|bao nhieu|bang gia|uu dai|khuyen mai|giam|tra gop|vnd|dong|trieu|lieu trinh|muc do)\b/.test(
    merged
  );
}

function collectNumericCandidates(text) {
  const values = new Set();
  const normalized = preprocessForMoneyScan(text);
  const folded = foldVietnamese(normalized);

  const explicitUnitRegex = /(\d+(?:[.,]\d+)?)\s*(trieu|tr|k|nghin|ngan|vnd|dong)\b/gi;
  let m;
  while ((m = explicitUnitRegex.exec(normalized)) !== null) {
    const v = parseMoneyNumber(m[1], m[2], { allowShort: true });
    if (v && v >= 50_000 && v <= MAX_REASONABLE_PRICE) values.add(v);
  }

  const rangeRegex = /(\d+(?:[.,]\d+)?)\s*(?:-|–|den|toi)\s*(\d+(?:[.,]\d+)?)\s*(trieu|tr|k|nghin|ngan|vnd|dong)?/g;
  while ((m = rangeRegex.exec(folded)) !== null) {
    const v1 = parseMoneyNumber(m[1], m[3] || "", { allowShort: true });
    const v2 = parseMoneyNumber(m[2], m[3] || "", { allowShort: true });
    if (v1 && v1 >= 50_000 && v1 <= MAX_REASONABLE_PRICE) values.add(v1);
    if (v2 && v2 >= 50_000 && v2 <= MAX_REASONABLE_PRICE) values.add(v2);
  }

  const groupedRegex = /\b\d{1,3}(?:[.,]\d{3}){1,4}\b/g;
  while ((m = groupedRegex.exec(normalized)) !== null) {
    const digits = String(m[0]).replace(/\D/g, "");
    if (digits.length < 5 || digits.length > 9) continue;
    const v = parseMoneyNumber(m[0], "", { allowShort: false });
    if (v && v <= MAX_REASONABLE_PRICE) values.add(v);
  }

  const tokens = normalized.split(/\s+/g).filter(Boolean);
  const metas = tokens.map((raw) => {
    const hasLetters = /[\p{L}]/u.test(raw);
    const clean = raw.replace(/[^0-9.,]/g, "");
    return {
      raw,
      hasLetters,
      clean,
      digits: clean.replace(/\D/g, "")
    };
  });

  for (const t of metas) {
    if (t.hasLetters || !t.digits) continue;
    if (t.digits.length < 5 || t.digits.length > 9) continue;
    const v = parseMoneyNumber(t.clean, "", { allowShort: false });
    if (v && v <= MAX_REASONABLE_PRICE) values.add(v);
  }

  return Array.from(values).sort((a, b) => a - b);
}

function extractMonetaryValues(question, answer, category) {
  if (!isPricingRelevant(question, answer, category)) return [];
  const text = `${question || ""}\n${answer || ""}`;
  const values = new Set();
  const extracted = collectNumericCandidates(text);
  extracted.forEach((v) => values.add(v));

  return Array.from(values).sort((a, b) => a - b);
}

function detectUnit(text) {
  const t = foldVietnamese(text);
  const hasRang = /\/\s*rang|\b1\s*rang\b|\bdvt\s*rang\b|\brang\b/.test(t);
  const hasTherapy =
    /\blieu trinh\b|\btoan ham\b|\b2 ham\b|\bmuc do\b|\bchinh nha\b|\binvisalign\b/.test(t);
  const hasLan = /\b1\s*lan\b|\blan\b/.test(t);

  if (hasRang && hasTherapy) return "mixed";
  if (hasTherapy) return "lieu_trinh";
  if (hasRang) return "rang";
  if (hasLan) return "lan";
  return "";
}

function extractFirstMatch(text, patterns) {
  for (const pattern of patterns) {
    const m = String(text || "").match(pattern);
    if (m && m[1]) return normalizeWhitespace(m[1]).slice(0, 220);
    if (m && m[0]) return normalizeWhitespace(m[0]).slice(0, 220);
  }
  return "";
}

function splitSegments(text) {
  return String(text || "")
    .split(/\n+|(?<=[.?!;])\s+/g)
    .map((x) => normalizeWhitespace(x))
    .filter(Boolean);
}

function extractPromotionText(question, answer) {
  const segments = [...splitSegments(question), ...splitSegments(answer)];
  const picked = [];
  for (const seg of segments) {
    const f = foldVietnamese(seg);
    if (/(uu dai|giam|tang|tri an|0%|lai suat|khuyen mai|khuyenmai|tra gop|mien phi)/.test(f)) {
      if (!picked.includes(seg)) picked.push(seg);
    }
    if (picked.length >= 4) break;
  }
  return picked.join(" | ").slice(0, 500);
}

function extractPackageCondition(question, answer) {
  const segments = [...splitSegments(question), ...splitSegments(answer)];
  const picked = [];
  for (const seg of segments) {
    const f = foldVietnamese(seg);
    if (
      /(ap dung|khong ap dung|dieu kien|truong hop|dat coc|giu uu dai|toi da|max|neu khach|khi khach|chi dinh)/.test(
        f
      )
    ) {
      if (!picked.includes(seg)) picked.push(seg);
    }
    if (picked.length >= 3) break;
  }
  return picked.join(" | ").slice(0, 500);
}

function extractPromotionValidUntil(question, answer) {
  const text = `${question || ""}\n${answer || ""}`;
  let m = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) {
    const yyyy = m[1];
    const mm = String(Number(m[2])).padStart(2, "0");
    const dd = String(Number(m[3])).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  m = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (m) {
    const dd = String(Number(m[1])).padStart(2, "0");
    const mm = String(Number(m[2])).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function extractPackageName(category, question, answer) {
  const q = normalizeWhitespace(question);
  if (/^Bảng giá/i.test(q)) {
    return q.replace(/^Bảng giá\s*/i, "").trim().slice(0, 220);
  }
  if (/^Chính sách ưu đãi/i.test(q)) {
    return q.replace(/^Chính sách ưu đãi\s*/i, "").trim().slice(0, 220);
  }

  const direct = extractFirstMatch(
    `${question}\n${answer}`,
    [
      /(combo\s*\d+\s*-\s*\d+\s*răng[^.\n;]*)/iu,
      /((?:gói|goi)\s[^.\n;]{3,120})/iu,
      /(invisalign[^.\n;]{0,120})/iu,
      /(all[\s-]*on[^.\n;]{0,120})/iu,
      /(mức độ\s*\d+[^.\n;]{0,120})/iu
    ]
  );
  if (direct) return direct;

  return "";
}

function enrichEntry(entry) {
  const question = String(entry?.question || "");
  const answer = String(entry?.answer || "");
  const category = String(entry?.category || "");
  const text = `${question}\n${answer}`;
  const pricingRelevant = isPricingRelevant(question, answer, category);
  const moneyValues = extractMonetaryValues(question, answer, category);
  const priceMin = moneyValues.length ? moneyValues[0] : null;
  const priceMax = moneyValues.length ? moneyValues[moneyValues.length - 1] : null;

  const packageName = extractPackageName(category, question, answer);
  const packageCondition =
    pricingRelevant || packageName ? extractPackageCondition(question, answer) : "";
  const promotionText = extractPromotionText(question, answer);
  const promotionValidUntil = extractPromotionValidUntil(question, answer);
  const unit = Number.isFinite(priceMin) ? detectUnit(text) : "";

  const out = {};
  for (const key of Object.keys(entry || {})) {
    if (
      key === "price_min" ||
      key === "price_max" ||
      key === "unit" ||
      key === "package_name" ||
      key === "package_condition" ||
      key === "promotion_text" ||
      key === "promotion_valid_until"
    ) {
      continue;
    }
    out[key] = entry[key];
    if (key === "answer") {
      out.price_min = priceMin;
      out.price_max = priceMax;
      out.unit = unit;
      out.package_name = packageName;
      out.package_condition = packageCondition;
      out.promotion_text = promotionText;
      out.promotion_valid_until = promotionValidUntil;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(out, "answer")) {
    out.price_min = priceMin;
    out.price_max = priceMax;
    out.unit = unit;
    out.package_name = packageName;
    out.package_condition = packageCondition;
    out.promotion_text = promotionText;
    out.promotion_valid_until = promotionValidUntil;
  }

  return out;
}

function main() {
  if (!fs.existsSync(KB_FILE)) {
    throw new Error(`KB file not found: ${KB_FILE}`);
  }
  const raw = fs.readFileSync(KB_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("KB file must be a JSON array.");
  }

  const next = parsed.map(enrichEntry);
  fs.writeFileSync(KB_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  const pricingGaps = next
    .filter(
      (item) =>
        isPricingRelevant(item.question, item.answer, item.category) &&
        !Number.isFinite(item.price_min) &&
        !Number.isFinite(item.price_max)
    )
    .map((item) => ({
      id: item.id,
      category: item.category,
      question: item.question
    }));
  const withPrice = next.filter((item) => Number.isFinite(item.price_min) && Number.isFinite(item.price_max)).length;
  const withPromo = next.filter((item) => String(item.promotion_text || "").trim()).length;
  const withPackage = next.filter((item) => String(item.package_name || "").trim()).length;

  console.log(
    JSON.stringify(
      {
        total: next.length,
        with_price_range: withPrice,
        with_promotion_text: withPromo,
        with_package_name: withPackage,
        pricing_gaps: pricingGaps.length
      },
      null,
      2
    )
  );
}

main();
