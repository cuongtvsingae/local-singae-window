/**
 * Một lần gọi MISA (get-data-application) để in key + giá trị gợi ý (phút/giờ/đi muộn…).
 * Chạy từ root repo: node tools/payroll-calculator/scripts/inspect-misa-app-keys.js
 * Cần MISA_CLIENT_ID, MISA_SECRET_KEY trong private/.env
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../../private/.env") });

const { postMisaOpenApi, defaultTimesheetApplicationUrl } = require("../../windowsshell/server/misaClient");

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thisMonthRange() {
  const now = new Date();
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}

function lastMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { from: ymd(first), to: ymd(last) };
}

function buildApplicationBody(subSystemCode, fromDate, toDate) {
  return {
    PageSize: 50,
    PageIndex: 1,
    Filter: null,
    CustomFilter: null,
    QuickSearch: {},
    CustomParam: {
      SubSystemCode: subSystemCode,
      FromDate: fromDate,
      ToDate: toDate
    }
  };
}

const KEY_HINT = /minute|phut|Minute|Hour|Time|Check|Late|Early|Over|OT|Overtime|Register|Gio|Phut|So|Value|Total|In|Out|Int$/i;

async function fetchFirstPage(sub, from, to) {
  const url = defaultTimesheetApplicationUrl();
  const { status, data } = await postMisaOpenApi(url, buildApplicationBody(sub, from, to));
  if (status !== 200) {
    console.error("HTTP", status, data);
    return { rows: [] };
  }
  if (!data || data.Success !== true) {
    console.error("MISA", data);
    return { rows: [] };
  }
  return { rows: Array.isArray(data.Data?.PageData) ? data.Data.PageData : [] };
}

async function main() {
  const monthArg = (process.argv[2] || "this").toLowerCase();
  const { from, to } = monthArg === "last" || monthArg === "lastmonth" ? lastMonthRange() : thisMonthRange();
  console.log("Date range (" + (monthArg.startsWith("last") ? "last month" : "this month") + "):", from, "->", to);
  for (const sub of ["LateInEarlyOut", "OverTime"]) {
    let { rows } = await fetchFirstPage(sub, from, to);
    if (sub === "OverTime" && !rows.length && !monthArg.startsWith("last")) {
      const lr = lastMonthRange();
      console.log("  (OverTime: thử tháng trước vì tháng này rỗng…)");
      const r2 = await fetchFirstPage(sub, lr.from, lr.to);
      rows = r2.rows;
    }
    const row = rows[0];
    console.log(`\n========== ${sub}  (${rows.length} bản ghi trang 1) ==========`);
    if (!row) {
      console.log("Không có bản ghi — chạy: node ... last   để dùng tháng trước");
      continue;
    }
    const keys = Object.keys(row).sort();
    console.log("Tất cả key (" + keys.length + "):", keys.join(", "));
    console.log("\nKey gợi ý (phút/giờ/Over/Late/Check…):");
    for (const k of keys) {
      if (KEY_HINT.test(k)) {
        const v = row[k];
        console.log(" ", k, "=>", v, `(${typeof v})`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
