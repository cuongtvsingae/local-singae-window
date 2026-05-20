

function removeVietnameseTones(str) {
  if (!str) return "";
  
  str = str.replace(/Ã |Ã¡|áº¡|áº£|Ã£|Ã¢|áº§|áº¥|áº­|áº©|áº«|Äƒ|áº±|áº¯|áº·|áº³|áºµ/g, "a");
  str = str.replace(/Ã¨|Ã©|áº¹|áº»|áº½|Ãª|á»|áº¿|á»‡|á»ƒ|á»…/g, "e");
  str = str.replace(/Ã¬|Ã­|á»‹|á»‰|Ä©/g, "i");
  str = str.replace(/Ã²|Ã³|á»|á»|Ãµ|Ã´|á»“|á»‘|á»™|á»•|á»—|Æ¡|á»|á»›|á»£|á»Ÿ|á»¡/g, "o");
  str = str.replace(/Ã¹|Ãº|á»¥|á»§|Å©|Æ°|á»«|á»©|á»±|á»­|á»¯/g, "u");
  str = str.replace(/á»³|Ã½|á»µ|á»·|á»¹/g, "y");
  str = str.replace(/Ä‘/g, "d");
  str = str.replace(/Ã€|Ã|áº |áº¢|Ãƒ|Ã‚|áº¦|áº¤|áº¬|áº¨|áºª|Ä‚|áº°|áº®|áº¶|áº²|áº´/g, "A");
  str = str.replace(/Ãˆ|Ã‰|áº¸|áºº|áº¼|ÃŠ|á»€|áº¾|á»†|á»‚|á»„/g, "E");
  str = str.replace(/ÃŒ|Ã|á»Š|á»ˆ|Ä¨/g, "I");
  str = str.replace(/Ã’|Ã“|á»Œ|á»Ž|Ã•|Ã”|á»’|á»|á»˜|á»”|á»–|Æ |á»œ|á»š|á»¢|á»ž|á» /g, "O");
  str = str.replace(/Ã™|Ãš|á»¤|á»¦|Å¨|Æ¯|á»ª|á»¨|á»°|á»¬|á»®/g, "U");
  str = str.replace(/á»²|Ã|á»´|á»¶|á»¸/g, "Y");
  str = str.replace(/Ä/g, "D");
  
  return str;
}

const FEMALE_NAME_PATTERNS = [
  "anh", "inh", "ung", "uong", "uyen", "oan", "oanh", "oan", "ai", "uy", "uyet",
  "an", "ang", "am", "ap", "at", "ac", "ach", "em", "ep", "et", "ec", "ech",
  "im", "ip", "it", "ic", "ich", "om", "op", "ot", "oc", "och", "um", "up", "ut", "uc", "uch"
];

const FEMALE_NAMES = [
  "lan", "mai", "linh", "ngoc", "thu", "ha", "anh", "huong", "hoa", "tram",
  "yen", "thao", "phuong", "hong", "van", "dung", "hang", "ly", "nhi", "my",
  "vy", "chi", "thuy", "quynh", "tien", "ngan", "khanh", "trang", "uyen", "oanh"
];

const MALE_NAMES = [
  "minh", "tuan", "hung", "dung", "tien", "hoang", "long", "khoa", "khanh", "nam",
  "quang", "thanh", "huy", "phuc", "dat", "vinh", "duy", "bao", "an", "binh",
  "cuong", "dai", "duc", "giang", "hai", "lam", "loc", "manh", "nghia", "phong"
];


function detectGenderFromName(name) {
  if (!name || typeof name !== "string") {
    return null;
  }

  const normalizedName = name.toLowerCase().trim();
  if (!normalizedName) {
    return null;
  }

  const nameWithoutTones = removeVietnameseTones(normalizedName);

  const nameParts = nameWithoutTones.split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];

  if (FEMALE_NAMES.includes(lastName)) {
    return "female";
  }
  if (MALE_NAMES.includes(lastName)) {
    return "male";
  }

  for (const pattern of FEMALE_NAME_PATTERNS) {
    if (lastName.endsWith(pattern) && lastName.length >= 3) {
      return "female";
    }
  }

  return null;
}


function getAddressForm(name, preferredAddress = null, gender = null) {
  if (preferredAddress && ["co", "chu", "anh", "chi"].includes(preferredAddress)) {
    return {
      address: preferredAddress,
      gender: preferredAddress === "co" || preferredAddress === "chi" ? "female" : "male"
    };
  }

  if (gender === "female") {
    return { address: "co", gender: "female" };
  }
  if (gender === "male") {
    return { address: "chu", gender: "male" };
  }

  const detectedGender = detectGenderFromName(name);
  if (detectedGender === "female") {
    return { address: "co", gender: "female" };
  }
  if (detectedGender === "male") {
    return { address: "chu", gender: "male" };
  }

  return { address: "co/chu", gender: null };
}

function normalizeAddressToken(value) {
  const s = String(value || "").trim().toLowerCase();
  if (s === "chị" || s === "chi") return "chi";
  if (s === "chú" || s === "chu") return "chu";
  if (s === "cô" || s === "co") return "co";
  if (s === "anh") return "anh";
  return "";
}

function normalizeVietnameseText(text) {
  return String(text || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function denormalizeHonorific(token) {
  if (token === "chi") return "chị";
  if (token === "chu") return "chú";
  if (token === "co") return "cô";
  if (token === "anh") return "anh";
  return "";
}

function buildResolvedHonorific(userHonorific, botSelfHonorific, source = "") {
  const user = String(userHonorific || "").trim();
  const bot = String(botSelfHonorific || "").trim();
  if (!user || !bot) return null;

  const preferredAddress = normalizeAddressToken(user) || null;
  const botNorm = bot.toLowerCase();
  const userNorm = user.toLowerCase();
  const peerBot = botNorm === "em" || botNorm === "cháu";
  const elderBot = botNorm === "con";

  let promptVI =
    `Trong **toàn bộ** user_message: **một** cặp — tự xưng "${bot}", gọi khách "${user}". Không đổi cặp giữa các câu.`;
  if (peerBot) {
    promptVI += ` Cấm tự xưng "con" hoặc gọi khách "cô/chú".`;
  } else if (elderBot) {
    promptVI += ` Cấm tự xưng "em" hoặc gọi khách "anh/chị".`;
    if (user.includes("/")) {
      promptVI += ` Gọi **một** danh xưng "cô" hoặc "chú" (theo ngữ cảnh), **cấm** ghi "cô/chú" trong tin.`;
    }
  }
  if (
    (userNorm.includes("anh") || userNorm.includes("chị")) &&
    elderBot
  ) {
    promptVI += ` Cấm ghép "con" với "anh/chị".`;
  }
  if (source) {
    promptVI += ` Nguồn: ${source}.`;
  }

  return {
    userHonorific: user,
    botSelfHonorific: bot,
    preferredAddress,
    promptVI,
    source: String(source || "").trim()
  };
}

/** Bỏ cặp legacy (Quý khách / nha khoa Singae) khỏi hồ sơ lưu. */
function sanitizeMirrorProfile(mirrorProfile) {
  if (!mirrorProfile || typeof mirrorProfile !== "object") return null;
  const user = String(mirrorProfile.userHonorific || "").trim();
  const bot = String(mirrorProfile.botSelfHonorific || "").trim().toLowerCase();
  if (!user || !bot) return null;
  if (user === "Quý khách" || bot.includes("singae")) return null;
  return { userHonorific: user, botSelfHonorific: String(mirrorProfile.botSelfHonorific || "").trim() };
}

function isCurrentTurnHonorificSource(source) {
  const src = String(source || "");
  if (!src || /lịch sử|đã xác định|mặc định|hồ sơ/i.test(src)) return false;
  return /tin hiện tại|vừa yêu cầu|trong câu hiện tại|khách gọi bot|khách tự xưng/i.test(src);
}

function isPersistableHonorificPair(userH, botH) {
  const user = String(userH || "").trim();
  const bot = String(botH || "").trim().toLowerCase();
  if (!user || !bot) return false;
  if (bot === "em" || bot === "cháu") {
    return user === "anh" || user === "chị" || user === "anh/chị";
  }
  if (bot === "con") {
    return user === "cô" || user === "chú" || user === "cô/chú";
  }
  return false;
}

/** Khách **chủ động đổi** xưng hô trong tin này (không gồm gọi bot em/anh ơi khi đã có cặp). */
function detectExplicitHonorificChangeInMessage(message) {
  if (!message || typeof message !== "string") return false;
  if (normalizeAddressToken(detectPreferenceFromMessage(message))) return true;
  if (detectCustomerSelfHonorific(message)) return true;
  return false;
}

/** Chỉ lưu cặp mới khi tin hiện tại có tín hiệu đổi xưng hô rõ. */
function shouldPersistHonorificFromTurn(resolved) {
  if (!isCurrentTurnHonorificSource(resolved?.source)) return false;
  return isPersistableHonorificPair(resolved?.userHonorific, resolved?.botSelfHonorific);
}

/**
 * Lưu cặp lần đầu sau khi đã gửi [XƯNG HÔ ĐÃ CHỌN] cho bot — kể cả mặc định con/cô/chú.
 * @returns {{ userHonorific: string, botSelfHonorific: string } | null}
 */
function resolveHonorificPairToPersist(resolved, mirrorProfile, gender = null) {
  const pair = normalizeHonorificPairForStorage(resolved, gender);
  if (!pair || !isPersistableHonorificPair(pair.userHonorific, pair.botSelfHonorific)) {
    return null;
  }
  if (shouldPersistHonorificFromTurn(resolved)) return pair;
  if (!sanitizeMirrorProfile(mirrorProfile)) return pair;
  return null;
}

function normalizeHonorificPairForStorage(resolved, gender = null) {
  if (!resolved) return null;
  let userH = String(resolved.userHonorific || "").trim();
  let botH = String(resolved.botSelfHonorific || "").trim();
  if (userH === "cô/chú" && (gender === "male" || gender === "female")) {
    userH = gender === "male" ? "chú" : "cô";
  }
  if (userH === "anh/chị" && (gender === "male" || gender === "female")) {
    userH = gender === "male" ? "anh" : "chị";
  }
  if (!userH || !botH) return null;
  return { userHonorific: userH, botSelfHonorific: botH };
}

function buildHonorificFromPreference(preference, source = "") {
  const token = normalizeAddressToken(preference);
  if (token === "anh") return buildResolvedHonorific("anh", "em", source);
  if (token === "chi") return buildResolvedHonorific("chị", "em", source);
  if (token === "chu") return buildResolvedHonorific("chú", "con", source);
  if (token === "co") return buildResolvedHonorific("cô", "con", source);
  return null;
}

function buildHonorificFromGender(gender, source = "") {
  if (gender === "male") return buildResolvedHonorific("chú", "con", source);
  if (gender === "female") return buildResolvedHonorific("cô", "con", source);
  return null;
}

function buildDefaultElderHonorific(gender = null, source = "") {
  if (gender === "male") return buildResolvedHonorific("chú", "con", source);
  if (gender === "female") return buildResolvedHonorific("cô", "con", source);
  return buildResolvedHonorific("cô/chú", "con", source);
}

function buildUnknownFallbackHonorific(source = "") {
  return buildDefaultElderHonorific(null, source);
}

/** Khách gọi bot là em/cháu/con (không phải tự xưng "em"). */
function detectCustomerCallsBotYounger(message) {
  if (!message || typeof message !== "string") return false;
  const n = normalizeVietnameseText(message);
  if (!n) return false;
  if (/\b(chao|xin chao|alo|hello|hi)\s+(em|chau|con)\b/i.test(n)) return true;
  if (/\b(ben|phia)\s+(em|chau|con)\b/i.test(n)) return true;
  if (/\b(cho|giup|ho tro)\s+(em|chau|con)\b/i.test(n)) return true;
  if (/^(em|chau|con)\s+(oi|ơi|a|nhe)\b/i.test(n)) return true;
  if (
    /^(em|chau|con)\s+(tu van|check|xem|goi|giup|ho tro|bao|nhan|dat|book|xep lich)\b/i.test(
      n
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Khách tự xưng em / mình / tôi / tớ (không tự xưng anh/chị/cô/chú) — mặc định con/cô/chú.
 */
function detectCustomerNeutralSelfPronoun(message) {
  if (!message || typeof message !== "string") return false;
  const n = normalizeVietnameseText(message);
  if (!n) return false;
  const selfVerb =
    "(muon|can|dang|o|oi|hoi|xin|xin chao|la|se|dinh|cho|nho|biet|da|mong|thich|can|dang can)";
  if (new RegExp(`^(em|toi|minh|to)\\s+${selfVerb}\\b`, "i").test(n)) return true;
  if (new RegExp(`\\b(em|toi|minh|to)\\s+${selfVerb}\\b`, "i").test(n)) return true;
  return false;
}

function resolveNeutralSelfPronounHonorific(message, sourceLabel, gender = null) {
  if (!detectCustomerNeutralSelfPronoun(message)) return null;
  if (detectCustomerCallsBotYounger(message)) return null;
  if (detectCustomerSelfHonorific(message)) return null;
  return buildDefaultElderHonorific(
    gender,
    sourceLabel || "khách xưng em/mình/tôi/tớ — mặc định con/cô/chú"
  );
}

/**
 * Khách tự xưng anh/chị/cô/chú (không phải chỉ gọi bot).
 * @returns {"anh"|"chi"|"co"|"chu"|null}
 */
function detectCustomerSelfHonorific(message) {
  if (!message || typeof message !== "string") return null;
  const raw = String(message).trim();
  if (!raw) return null;
  const n = normalizeVietnameseText(raw);
  const openVerb =
    "(chao|xin chao|can|muon|dang|o|hoi|dat|em|da|se|dinh|cho|nho|biet)";

  if (/\b(em|toi|minh|ban)\s+(la|là)\s+anh\b/i.test(n)) return "anh";
  if (/\b(em|toi|minh|ban)\s+(la|là)\s+(chi|chị)\b/i.test(n)) return "chi";
  if (/\b(em|toi|minh|ban)\s+(la|là)\s+(co|cô)\b/i.test(n)) return "co";
  if (/\b(em|toi|minh|ban)\s+(la|là)\s+(chu|chú)\b/i.test(n)) return "chu";

  if (new RegExp(`^anh\\s+${openVerb}\\b`, "i").test(n)) return "anh";
  if (/^anh[,!.]/i.test(raw)) return "anh";

  if (new RegExp(`^(chi|chị)\\s+${openVerb}\\b`, "i").test(n)) return "chi";
  if (/^(chi|chị)[,!.]/i.test(raw)) return "chi";

  if (new RegExp(`^(co|cô)\\s+${openVerb}\\b`, "i").test(n)) return "co";
  if (/^(co|cô)[,!.]/i.test(raw)) return "co";

  if (new RegExp(`^(chu|chú)\\s+${openVerb}\\b`, "i").test(n)) return "chu";
  if (/^(chu|chú)[,!.]/i.test(raw)) return "chu";

  if (/\b(xung|goi)\s+anh\b/i.test(n)) return "anh";
  if (/\b(xung|goi)\s+(chi|chị)\b/i.test(n)) return "chi";
  if (/\b(xung|goi)\s+(co|cô)\b/i.test(n)) return "co";
  if (/\b(xung|goi)\s+(chu|chú)\b/i.test(n)) return "chu";

  return null;
}

function resolveFromCustomerSelfHonorific(message, sourceLabel) {
  const self = detectCustomerSelfHonorific(message);
  if (self === "anh") {
    return buildResolvedHonorific("anh", "em", sourceLabel || "khách tự xưng anh");
  }
  if (self === "chi") {
    return buildResolvedHonorific("chị", "em", sourceLabel || "khách tự xưng chị");
  }
  if (self === "co") {
    return buildResolvedHonorific("cô", "con", sourceLabel || "khách tự xưng cô");
  }
  if (self === "chu") {
    return buildResolvedHonorific("chú", "con", sourceLabel || "khách tự xưng chú");
  }
  return null;
}


function detectPreferenceFromMessage(message) {
  if (!message || typeof message !== "string") {
    return null;
  }

  const normalizedMessage = message.toLowerCase().trim();
  
  if (/\b(co|chÃº|chu)\b.*\b(tre|tráº»|tráº» trung|tráº» con|tráº» em|tráº» quÃ¡|tráº» láº¯m)\b/i.test(normalizedMessage) ||
      /\b(tre|tráº»|tráº» trung|tráº» quÃ¡|tráº» láº¯m)\b.*\b(co|chÃº|chu)\b/i.test(normalizedMessage) ||
      /\b(khong|khÃ´ng)\b.*\b(co|chÃº|chu)\b.*\b(tre|tráº»)\b/i.test(normalizedMessage) ||
      /\b(khong|khÃ´ng)\b.*\b(pháº£i|phai)\b.*\b(co|chÃº|chu)\b/i.test(normalizedMessage)) {
    return null;
  }

  const explicitPatterns = [
    // Explicit remap, e.g. "goi anh la chu", "goi em la co"
    { regex: /\b(goi|gọi)\b.{0,30}\b(la|là)\b.{0,5}\b(chu|chú)\b/i, result: "chu" },
    { regex: /\b(goi|gọi)\b.{0,30}\b(la|là)\b.{0,5}\b(co|cô)\b/i, result: "co" },
    { regex: /\b(goi|gọi)\b.{0,30}\b(la|là)\b.{0,5}\b(anh)\b/i, result: "anh" },
    { regex: /\b(goi|gọi)\b.{0,30}\b(la|là)\b.{0,5}\b(chi|chị)\b/i, result: "chi" },

    { regex: /\b(goi|gá»i|gá»i tÃ´i|gá»i mÃ¬nh|gá»i em|gá»i báº¡n|gá»i tÃ´i lÃ )\b.*\b(anh)\b/i, result: "anh" },
    { regex: /\b(goi|gá»i|gá»i tÃ´i|gá»i mÃ¬nh|gá»i em|gá»i báº¡n|gá»i tÃ´i lÃ )\b.*\b(chá»‹|chi)\b/i, result: "chi" },
    { regex: /\b(xÆ°ng|xung|gá»i|goi)\b.*\b(anh)\b/i, result: "anh" },
    { regex: /\b(xÆ°ng|xung|gá»i|goi)\b.*\b(chá»‹|chi)\b/i, result: "chi" },
    { regex: /\b(tÃ´i|mÃ¬nh|em|báº¡n)\b.*\b(lÃ |la)\b.*\b(anh)\b/i, result: "anh" },
    { regex: /\b(tÃ´i|mÃ¬nh|em|báº¡n)\b.*\b(lÃ |la)\b.*\b(chá»‹|chi)\b/i, result: "chi" },
    { regex: /\b(Ä‘á»«ng|dung|khÃ´ng|khong)\b.*\b(gá»i|goi)\b.*\b(co|chÃº|chu)\b/i, result: null }, // Hint Ä‘á»ƒ dÃ¹ng anh/chá»‹
  ];

  for (const pattern of explicitPatterns) {
    if (pattern.regex.test(normalizedMessage)) {
      return pattern.result;
    }
  }

  return null;
}

/**
 * Nếu khách mở lời với cặp xưng hô rõ (vd: "anh chào em", "em chào anh")
 * hoặc gọi bot là "em/cháu/con" theo cách tự nhiên (vd: "chào em", "em tư vấn giúp chị")
 * → bot gương lại: tự xưng đúng vai khách gán, gọi khách đúng vai phù hợp.
 * @returns {{ userHonorific: string, botSelfHonorific: string, promptVI: string } | null}
 */
function inferMirrorFromUserUtterance(text, options = {}) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  if (detectCustomerNeutralSelfPronoun(raw) && !detectCustomerCallsBotYounger(raw)) {
    if (!detectCustomerSelfHonorific(raw)) return null;
  }

  const normalized = normalizeVietnameseText(raw);
  const preferredAddress = String(options.preferredAddress || "").trim().toLowerCase();
  const gender = String(options.gender || "").trim().toLowerCase();

  const normChi = (h) => {
    const x = String(h || "").trim().toLowerCase();
    if (x === "chi") return "chị";
    return String(h || "").trim();
  };

  const resolveOlderUserHonorific = (botH = "em") => {
    if (preferredAddress === "anh") return "anh";
    if (preferredAddress === "chi" || preferredAddress === "chị") return "chị";
    if (preferredAddress === "chu" || preferredAddress === "chú") return "chú";
    if (preferredAddress === "co" || preferredAddress === "cô") return "cô";
    if (botH === "em") {
      if (gender === "male") return "anh";
      if (gender === "female") return "chị";
      return "anh/chị";
    }
    if (gender === "male") return "chú";
    if (gender === "female") return "cô";
    return "cô/chú";
  };

  const reOlderToYounger =
    /^(anh|chị|chi|chú|cô|bác|ông|bà)\s+ch(?:à|a)o\s+(em|cháu|con)\b/ui;
  const m1 = raw.match(reOlderToYounger);
  if (m1) {
    const userH = normChi(m1[1]);
    const botH = m1[2].toLowerCase();
    return buildResolvedHonorific(userH, botH, `khách tự xưng "${userH}" và gọi bot là "${botH}"`);
  }

  const reYoungerToOlder =
    /^(em|cháu|con)\s+ch(?:à|a)o\s+(anh|chị|chi|chú|cô|bác)\b/ui;
  const m2 = raw.match(reYoungerToOlder);
  if (m2) {
    const botH = m2[1].toLowerCase();
    const userH = normChi(m2[2]);
    return buildResolvedHonorific(userH, botH, `khách gọi bot là "${userH}" và tự xưng "${botH}"`);
  }

  const reYoungerXinChao =
    /^(em|cháu|con)\s+xin\s+ch(?:à|a)o\s+(anh|chị|chi|chú|cô|bác)\b/ui;
  const m3 = raw.match(reYoungerXinChao);
  if (m3) {
    const botH = m3[1].toLowerCase();
    const userH = normChi(m3[2]);
    return buildResolvedHonorific(userH, botH, `khách xưng "${botH}" và chào "${userH}"`);
  }

  const reAddressOlderOi =
    /^(anh|chi|chị|chu|chú|co|cô)\s+(oi|ơi|a|nhe)\b/ui;
  const mOi = raw.match(reAddressOlderOi) || normalized.match(/^(anh|chi|chu|co)\s+(oi|a|nhe)\b/i);
  if (mOi) {
    const token = normalizeAddressToken(mOi[1]);
    if (token === "anh") {
      return buildResolvedHonorific("anh", "em", "khách gọi bot anh");
    }
    if (token === "chi") {
      return buildResolvedHonorific("chị", "em", "khách gọi bot chị");
    }
    if (token === "chu") {
      return buildResolvedHonorific("chú", "con", "khách gọi bot chú");
    }
    if (token === "co") {
      return buildResolvedHonorific("cô", "con", "khách gọi bot cô");
    }
  }

  const youngerBotAddressPatterns = [
    /\b(chao|xin chao|alo|hello|hi)\s+(em|chau|con)\b/i,
    /\b(ben|phia)\s+(em|chau|con)\b/i,
    /\b(cho|giup|ho tro)\s+(em|chau|con)\b/i,
    /^(em|chau|con)\s+(oi|ơi|a|nhe)\b/i,
    /^(em|chau|con)\s+(tu van|check|xem|goi|giup|ho tro|bao|nhan|dat|book|xep lich)\b/i
  ];
  if (youngerBotAddressPatterns.some((regex) => regex.test(normalized))) {
    const botH = normalized.includes("chau") ? "cháu" : normalized.includes("con") ? "con" : "em";
    const explicitOlderUser = normalized.match(/^(?:em|chau|con)\b[\s\S]{0,80}\b(anh|chi|chu|co|bac|ong|ba)\b/i);
    const userH = explicitOlderUser ? normChi(explicitOlderUser[1]) : resolveOlderUserHonorific(botH);
    return buildResolvedHonorific(userH, botH, `khách gọi bot là "${botH}" trong câu hiện tại`);
  }

  return null;
}

function resolveHonorificFromCurrentMessage(
  currentMessage = "",
  { preferredAddress = null, gender = null } = {}
) {
  const currentPreference = normalizeAddressToken(detectPreferenceFromMessage(currentMessage));
  if (currentPreference) {
    return buildHonorificFromPreference(
      currentPreference,
      "khách vừa yêu cầu rõ cách xưng hô trong tin hiện tại"
    );
  }

  let resolved = resolveFromCustomerSelfHonorific(
    currentMessage,
    "khách tự xưng anh/chị/cô/chú trong tin hiện tại"
  );
  if (resolved) return resolved;

  resolved = inferMirrorFromUserUtterance(currentMessage, { preferredAddress, gender });
  if (resolved) return resolved;

  resolved = resolveNeutralSelfPronounHonorific(
    currentMessage,
    "khách xưng em/mình/tôi/tớ trong tin hiện tại",
    gender
  );
  if (resolved) return resolved;

  resolved = buildHonorificFromPreference(preferredAddress, "ưu tiên địa chỉ đã lưu hồ sơ");
  if (resolved) return resolved;

  resolved = buildHonorificFromGender(gender, "giới tính hồ sơ — con/cô hoặc con/chú");
  if (resolved) return resolved;

  return buildDefaultElderHonorific(gender, "chưa rõ — mặc định con/cô/chú");
}

function resolveConversationHonorific({
  currentMessage = "",
  preferredAddress = null,
  mirrorProfile = null,
  gender = null
} = {}) {
  const stored = sanitizeMirrorProfile(mirrorProfile);

  if (stored && !detectExplicitHonorificChangeInMessage(currentMessage)) {
    return buildResolvedHonorific(
      stored.userHonorific,
      stored.botSelfHonorific,
      "cặp xưng hô đã xác định — giữ cho tin này"
    );
  }

  return resolveHonorificFromCurrentMessage(currentMessage, { preferredAddress, gender });
}

/** Cuối câu: nhé → ạ (CSKH Singae dùng ạ, không nhé). */
function normalizePoliteParticles(text) {
  let out = String(text || "");
  out = out.replace(/\s+nhé\s+ạ/gi, " ạ");
  out = out.replace(/([\s,.!?…])(nhé|nhe)(?=[\s,.!?…\n]|$)/gi, "$1ạ");
  out = out.replace(/\s+ạ\s+ạ/g, " ạ");
  return out;
}

/**
 * Chuẩn hóa user_message sau LLM — sửa trộn xưng hô phổ biến (vd "Bên con/em" + "Quý khách").
 * @param {string} text
 * @param {{ userHonorific: string, botSelfHonorific: string } | null} honorific
 */
function applyHonorificConsistency(text, honorific) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  if (!honorific) return normalizePoliteParticles(raw);

  const user = String(honorific.userHonorific || "").trim();
  const bot = String(honorific.botSelfHonorific || "").trim();
  const botNorm = bot.toLowerCase();
  const userNorm = user.toLowerCase();
  const peerBot = botNorm === "em" || botNorm === "cháu";
  const elderBot = botNorm === "con";

  let out = raw;

  const slashPair = peerBot ? "em" : "con";
  out = out.replace(/\bBên\s+con\s*\/?\s*em\b/gi, peerBot ? "Bên em" : "Bên con");
  out = out.replace(/\bBên\s+em\s*\/\s*con\b/gi, peerBot ? "Bên em" : "Bên con");
  out = out.replace(/\b(?:con|em)\s*\/\s*(?:con|em)\b/gi, slashPair);

  if (peerBot) {
    if (userNorm === "anh" || userNorm === "chị") {
      out = out.replace(/\bQuý\s+khách\b/gi, user);
    }
    out = out.replace(/\bcho\s+con\s+xin\b/gi, "cho em xin");
    out = out.replace(/\bBên\s+con\b/gi, "Bên em");
    out = out.replace(/\bNha khoa Singae\s+rất\s+mong\b/gi, "em rất mong");
    out = out.replace(/\bnha\s+khoa\s+Singae\s+(?=xin|rất|đã|mong)/gi, "em ");
  } else if (elderBot) {
    out = out.replace(/\bQuý\s+khách\b/gi, user.includes("/") ? "cô" : user);
    out = out.replace(/\bcho\s+em\s+xin\b/gi, "cho con xin");
    out = out.replace(/\bBên\s+em\b/gi, "Bên con");
    out = out.replace(/\bNha khoa Singae\s+rất\s+mong\b/gi, "con rất mong");
    out = out.replace(/\bnha\s+khoa\s+Singae\s+(?=xin|rất|đã|mong)/gi, "con ");
    out = out.replace(/\bem\s+rất\s+mong\b/gi, "con rất mong");
  }

  return normalizePoliteParticles(out.replace(/ {2,}/g, " ").trim());
}

module.exports = {
  detectGenderFromName,
  getAddressForm,
  detectPreferenceFromMessage,
  detectCustomerSelfHonorific,
  detectCustomerNeutralSelfPronoun,
  detectCustomerCallsBotYounger,
  inferMirrorFromUserUtterance,
  normalizeAddressToken,
  sanitizeMirrorProfile,
  detectExplicitHonorificChangeInMessage,
  shouldPersistHonorificFromTurn,
  isPersistableHonorificPair,
  normalizeHonorificPairForStorage,
  resolveHonorificPairToPersist,
  resolveConversationHonorific,
  normalizePoliteParticles,
  applyHonorificConsistency
};





