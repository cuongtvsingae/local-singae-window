/**
 * One-off / maintainer: split chatCases.legacy.txt → rulesHub.txt + cases.compact.xml
 * Run: node local/chatbot/server/scripts/buildCompactPrompt.cjs
 */
const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "..", "prompts");
const LEGACY = path.join(PROMPTS_DIR, "chatCases.legacy.txt");
const RULES_HUB = path.join(PROMPTS_DIR, "rulesHub.txt");
const CASES_COMPACT = path.join(PROMPTS_DIR, "cases.compact.xml");

const MUST_NOT_CHUNG = `<must_not_chung>
**Áp dụng mọi case** (trừ khi case ghi ngoại lệ rõ). Tuân \`<gioi_dien_va_do_dai>\`, \`<quy_tac_bat_buoc>\`, runtime [CASE], [XƯNG HÔ ĐÃ CHỌN], [INTAKE CÒN THIẾU]:
- Tiếng Việt **có dấu**; **cấm** teencode / markdown * / \\n\\n (trừ block địa chỉ theo \`<dia_chi_co_so_bat_buoc>\`).
- **Cấm** nhại lại câu khách; **cấm** xin họ tên; **cấm** báo giá số cụ thể; **cấm** CTKM từ [KB-n].
- **Cấm** lặp chào đầy đủ khi đã có bot trong [LỊCH SỬ CHAT]; **cấm** gộp 2 field intake trong một tin.
- **Cấm** câu mở *cần thông tin gì / hỗ trợ thêm* không thu dữ liệu; **cấm** *con không biết / không rõ*.
- **Cấm** chẩn đoán / kê đơn / cam kết y khoa thay bác sĩ.
- Hỏi lại field đã có trong [INTAKE TÓM TẮT] / intake / tin khách — xem \`<uu_tien_khai_thac_mac_dinh>\`.
</must_not_chung>
`;

function compactCaseBlock(block) {
  const idMatch = block.match(/<case\s+id="([^"]+)"/);
  const id = idMatch ? idMatch[1] : "unknown";
  const kw = (block.match(/<keywords>([\s\S]*?)<\/keywords>/) || [])[1]?.trim() || "";
  const when = (block.match(/<when>([\s\S]*?)<\/when>/) || [])[1]?.trim() || "";
  let must = (block.match(/<must>([\s\S]*?)<\/must>/) || [])[1]?.trim() || "";
  if (must.length > 900) {
    must = must.slice(0, 897) + "…";
  }
  const refs = (block.match(/<refs>([\s\S]*?)<\/refs>/) || [])[1]?.trim() || "gioi_dien;uu_tien;khai_thac_thong_minh_theo_cau_hoi;must_not_chung";
  const shortRefs = refs
    .split(/[;,]/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join("; ");

  let mustNotExtra = "";
  const mn = (block.match(/<must_not>([\s\S]*?)<\/must_not>/) || [])[1]?.trim();
  if (mn) {
    const parts = mn.split(/[;.]\s+/).filter((p) => p.length > 12);
    const unique = [];
    for (const p of parts) {
      const low = p.toLowerCase();
      if (/markdown|khong biet|cho con biet|bao gia|ctkm.*kb/i.test(low)) continue;
      if (unique.length < 3) unique.push(p.replace(/\s+/g, " ").trim());
    }
    if (unique.length) {
      mustNotExtra = `\n  <must_not_case>Ngoại lệ case: ${unique.join("; ")}. Còn lại: must_not_chung.</must_not_case>`;
    }
  }

  return `<case id="${id}">
  <keywords>${kw}</keywords>
  <when>${when}</when>
  <must>${must}</must>${mustNotExtra}
  <refs>${shortRefs || "gioi_dien;uu_tien;must_not_chung"}</refs>
</case>`;
}

function stripXmlBlock(text, tagName) {
  const re = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, "gi");
  return text.replace(re, "").trim();
}

function replaceXmlBlock(text, tagName, replacement) {
  const re = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, "i");
  if (!re.test(text)) return text;
  return text.replace(re, replacement);
}

const XUNG_HO_SHORT = `<xung_ho>
**Nguồn duy nhất** xưng hô. [XƯNG HÔ ĐÃ CHỌN] → ưu tiên tuyệt đối. Cặp: trẻ **em**/anh(chị); lớn **con**/cô(chú); chưa rõ **nha khoa Singae**/**Quý khách**. Khách tự xưng anh/chị/cô/chú hoặc gọi bot em/con → lưu cặp. Khách xưng **em/mình/tôi/tớ** (tự xưng) → giữ Quý khách. Cấm trộn cặp. Tin đầu: chào+identity; tin sau: cấm chào đầy đủ [CASE 2].
</xung_ho>`;

const THU_TU_THU_THAP_SHORT = `<thu_tu_thu_thap_thong_tin_cot_loi>
**Một tin — một câu khai thác** (notes **hoặc** regionLive **hoặc** SĐT). Thứ tự field: \`<uu_tien_khai_thac_mac_dinh>\` + runtime **[INTAKE CÒN THIẾU]**. Sau SĐT: ưu tiên trả lời ý khách rồi một field còn thiếu. Đủ notes+region+phone → làm sâu notes (một chi tiết/lượt). SĐT/regex: **[HUONG DAN JSON]**.
</thu_tu_thu_thap_thong_tin_cot_loi>`;

const QUY_TAC_SHORT = `<quy_tac_bat_buoc>
Bám \`<gioi_dien_va_do_dai>\`, \`<thu_tu_uu_tien_noi_dung_hoi_thoai>\`, \`<must_not_chung>\`. Tin đầu: \`<mo_dau_dong_thoi_case>\` trước trọng tâm. Một \\n giữa ý (cấm \\n\\n trừ \`<dia_chi_co_so_bat_buoc>\`). Kết tin: một câu khai thác hoặc mời SĐT đúng lượt — \`<cach_hoi_xin_thong_tin_khai_thac>\`. Không báo giá số; CTKM chỉ từ file cuối prompt. Không thông báo "đã lưu/ghi nhận" khi đang khai thác.
</quy_tac_bat_buoc>`;

function trimRulesHub(hub) {
  let out = hub;
  out = replaceXmlBlock(out, "xung_ho", XUNG_HO_SHORT);
  out = replaceXmlBlock(out, "thu_tu_thu_thap_thong_tin_cot_loi", THU_TU_THU_THAP_SHORT);
  out = replaceXmlBlock(out, "quy_tac_bat_buoc", QUY_TAC_SHORT);
  out = stripXmlBlock(out, "khai_thac_thong_minh");
  out = replaceXmlBlock(
    out,
    "khai_thac_thong_minh_theo_cau_hoi",
    `<khai_thac_thong_minh_theo_cau_hoi>
Map case → trọng tâm; tin đầu: \`<first_turn_case_prefix>\` + \`<mo_dau_dong_thoi_case>\`. Field: \`<uu_tien_khai_thac_mac_dinh>\` + [INTAKE CÒN THIẾU]; chốt \`<cach_hoi_xin_thong_tin_khai_thac>\`. CTKM: \`<ctkm_rules>\`. Có phone đặt lịch → merge + \`create_booking_request\` ngay.
</khai_thac_thong_minh_theo_cau_hoi>`
  );
  out = out.replace(/chatCases\.txt/g, "rulesHub / cases.compact");
  return out;
}

function main() {
  if (!fs.existsSync(LEGACY)) {
    console.error("Missing", LEGACY);
    process.exit(1);
  }
  const raw = fs.readFileSync(LEGACY, "utf8");
  const caseStart = raw.search(/<case\s+id="/i);
  if (caseStart < 0) {
    console.error("No <case> found in legacy");
    process.exit(1);
  }
  let hubPart = raw.slice(0, caseStart).trim();
  hubPart = hubPart.replace(/<singae_chat_cases>[\s\S]*?<chat_case_database>/i, "<singae_rules_hub>\n<chat_rules_hub>");
  hubPart += `\n\n${MUST_NOT_CHUNG}\n</chat_rules_hub>`;

  const casesPart = raw.slice(caseStart);
  const caseBlocks = casesPart.match(/<case\s+id="[^"]+"[\s\S]*?<\/case>/gi) || [];
  const compactCases = caseBlocks.map(compactCaseBlock).join("\n\n");

  const casesXml = `<singae_cases_compact>
<chat_case_database>
${compactCases}
</chat_case_database>
</singae_cases_compact>
`;

  hubPart = trimRulesHub(hubPart);
  fs.writeFileSync(RULES_HUB, hubPart, "utf8");
  fs.writeFileSync(CASES_COMPACT, casesXml, "utf8");
  console.log("rulesHub:", fs.statSync(RULES_HUB).size, "bytes");
  console.log("cases.compact:", fs.statSync(CASES_COMPACT).size, "bytes");
  console.log("legacy:", fs.statSync(LEGACY).size, "bytes");
}

main();
