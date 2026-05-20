const axios = require("axios");

const SIMLY_PUBLIC_BASE = String(
  process.env.SIMLY_PUBLIC_BASE_URL ||
    process.env.VPS_PUBLIC_BASE_URL ||
    "https://singae.cloud"
)
  .trim()
  .replace(/\/$/, "");

function normalizeOfficeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function todayYyyyMmDd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchPublicTokens() {
  const url = `${SIMLY_PUBLIC_BASE}/api/public/tokens`;
  const r = await axios.get(url, { timeout: 20000, validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Simly public tokens failed: HTTP ${r.status}`);
  }
  return r.data;
}

async function fetchSimlyAppointmentsJson(params = {}) {
  const officeKey = normalizeOfficeKey(params.officeKey ?? params.office ?? params.facility ?? "");
  const today = todayYyyyMmDd();
  const fromDate = String(params.fromDate || "").trim() || today;
  const toDate = String(params.toDate || "").trim() || fromDate;
  const search = String(params.search ?? "").trim();
  const page = Math.max(1, Number.parseInt(String(params.page || "1"), 10) || 1);
  const rawPageSize = Number.parseInt(String(params.pageSize || "100"), 10);
  const pageSize = Math.min(500, Math.max(1, Number.isFinite(rawPageSize) ? rawPageSize : 100));

  const url = `${SIMLY_PUBLIC_BASE}/api/public/appointment`;
  const r = await axios.get(url, {
    params: { office: officeKey, fromDate, toDate, search, page, pageSize },
    timeout: 60000,
    validateStatus: () => true
  });
  if (r.status < 200 || r.status >= 300) {
    const err = new Error(r.data?.error || `Simly appointment proxy failed: HTTP ${r.status}`);
    err.statusCode = r.status;
    err.detail = r.data;
    throw err;
  }
  return r.data;
}

module.exports = {
  SIMLY_PUBLIC_BASE,
  fetchPublicTokens,
  fetchSimlyAppointmentsJson,
  todayYyyyMmDd,
  normalizeOfficeKey
};
