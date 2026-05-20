/**
 * Hai cơ sở Singae — metadata trong SQLite (bảng riêng), tách với bảng lịch Simly theo office_key.
 * office_key khớp Simly: 25VNP (Hà Nội), 355LTT (HCM).
 */
const { sqlRun, sqlAll, sqlGet, ensureInit } = require("./sqliteStore");

const FACILITY_ROWS = [
  {
    office_key: "25VNP",
    sort_order: 1,
    name: "Nha khoa Singae — Cơ sở Hà Nội",
    city_label: "Hà Nội",
    address: "Tòa 2, Biệt thự Lacasa Villa, 25 Vũ Ngọc Phan, Phường Láng.",
    license_text: "Giấy phép hoạt động: 902/HNO-GPHĐ/CL2 do Sở Y tế Thành phố Hà Nội cấp.",
    map_url:
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent("Tòa 2, Biệt thự Lacasa Villa, 25 Vũ Ngọc Phan, Phường Láng, Hà Nội"),
    hours_label: "8:00 – 19:00 (tất cả các ngày trong tuần)",
    hotline: "+84 911 54 9999",
    messaging_contact: "Zalo / Viber / WhatsApp: +84 911 54 9999"
  },
  {
    office_key: "355LTT",
    sort_order: 2,
    name: "Nha khoa Singae — Cơ sở Hồ Chí Minh",
    city_label: "TP. Hồ Chí Minh",
    address: "355 Lý Thái Tổ, Phường Vườn Lài.",
    license_text: "Giấy phép hoạt động: 10830/HCM-GPHĐ do Sở Y tế TP. Hồ Chí Minh cấp.",
    map_url:
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent("355 Lý Thái Tổ, Phường Vườn Lài, Hồ Chí Minh"),
    hours_label: "8:00 – 19:00 (tất cả các ngày trong tuần)",
    hotline: "+84 911 54 9999",
    messaging_contact: "Zalo / Viber / WhatsApp: +84 911 54 9999"
  }
];

async function seedSingaeClinicFacilitiesIfEmpty() {
  await ensureInit();
  const row = await sqlGet(`SELECT COUNT(*) AS c FROM singae_clinic_facility`);
  const n = Number(row?.c || 0);
  if (n > 0) return { seeded: false, count: n };
  for (const f of FACILITY_ROWS) {
    await sqlRun(
      `INSERT OR REPLACE INTO singae_clinic_facility (
        office_key, sort_order, name, city_label, address, license_text, map_url, hours_label, hotline, messaging_contact
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        f.office_key,
        f.sort_order,
        f.name,
        f.city_label,
        f.address,
        f.license_text,
        f.map_url,
        f.hours_label,
        f.hotline,
        f.messaging_contact
      ]
    );
  }
  return { seeded: true, count: FACILITY_ROWS.length };
}

async function listClinicFacilities() {
  await seedSingaeClinicFacilitiesIfEmpty();
  return sqlAll(`SELECT * FROM singae_clinic_facility ORDER BY sort_order ASC, office_key ASC`);
}

/** Khối markdown đưa vào prompt (hai cơ sở + mã office cho collected). */
function buildFacilitiesMarkdownBlock(rows) {
  const list = Array.isArray(rows) && rows.length ? rows : FACILITY_ROWS;
  const lines = list.map((f) => {
    const key = String(f.office_key || "").trim();
    return (
      `### ${f.name} (\`office_key=${key}\`)\n` +
      `- **Địa chỉ:** ${f.address}\n` +
      `- **Giấy phép:** ${f.license_text} [Xem bản đồ](${f.map_url})\n` +
      `- **Giờ làm việc:** ${f.hours_label}\n` +
      `- **Hotline:** ${f.hotline} · ${f.messaging_contact}`
    );
  });
  return (
    `\n\n[HAI_CO_SO_SINGAE — DUNG CHO collected.patient.preferredOfficeKey]:\n` +
    `- **Hà Nội** → \`preferredOfficeKey\` = \`25VNP\`\n` +
    `- **TP.HCM** → \`preferredOfficeKey\` = \`355LTT\`\n` +
    `Chi tiết từng cơ sở:\n\n${lines.join("\n\n")}`
  );
}

module.exports = {
  FACILITY_ROWS,
  seedSingaeClinicFacilitiesIfEmpty,
  listClinicFacilities,
  buildFacilitiesMarkdownBlock
};
