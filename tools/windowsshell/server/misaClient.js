const crypto = require("crypto");
const axios = require("axios");

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function buildTransactionId() {
  const fixed = env("MISA_TRANSACTION_ID");
  if (fixed) return fixed;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Khớp tài liệu MISA (C#): HMACSHA256(UTF8 secret, UTF8 x-transactionid) → Base64
 */
function buildMisaToken(secretKey, transactionId) {
  const enc = env("MISA_TOKEN_ENCODING", "base64").toLowerCase();
  const h = crypto.createHmac("sha256", Buffer.from(String(secretKey), "utf8"));
  h.update(String(transactionId), "utf8");
  if (enc === "hex") {
    let out = h.digest("hex");
    if (String(process.env.MISA_TOKEN_HEX_UPPERCASE || "").toLowerCase() === "true") {
      out = out.toUpperCase();
    }
    return out;
  }
  return h.digest("base64");
}

function buildMisaHeaders() {
  const transactionId = buildTransactionId();
  const clientId = env("MISA_CLIENT_ID");
  const secret = env("MISA_SECRET_KEY");
  if (!clientId || !secret) {
    const err = new Error("MISA_CLIENT_ID and MISA_SECRET_KEY are required");
    err.code = "MISA_CONFIG";
    throw err;
  }
  const token = buildMisaToken(secret, transactionId);
  return {
    headers: {
      "x-clientid": clientId,
      "x-transactionid": transactionId,
      "x-token": token,
      Accept: "application/json"
    }
  };
}

async function fetchEmployeesFromMisa() {
  const url =
    env("MISA_EMPLOYEE_API_URL") ||
    "https://amisapp.misa.vn/APIS/TimesheetOpenAPI/api/Open/get-data-employee";
  if (!url) {
    const err = new Error("MISA_EMPLOYEE_API_URL is empty");
    err.code = "MISA_CONFIG";
    throw err;
  }
  const { headers } = buildMisaHeaders();
  const timeoutMs = Number(process.env.MISA_API_TIMEOUT_MS || 60000);
  const r = await axios.get(url, {
    headers,
    timeout: timeoutMs,
    validateStatus: () => true
  });
  return { status: r.status, data: r.data };
}

/**
 * POST JSON tới Open API MISA (cùng header x-clientid / x-transactionid / x-token).
 */
async function postMisaOpenApi(url, jsonBody) {
  if (!url) {
    const err = new Error("MISA URL is empty");
    err.code = "MISA_CONFIG";
    throw err;
  }
  const { headers } = buildMisaHeaders();
  const timeoutMs = Number(process.env.MISA_API_TIMEOUT_MS || 60000);
  const r = await axios.post(url, jsonBody, {
    headers: { ...headers, "Content-Type": "application/json" },
    timeout: timeoutMs,
    validateStatus: () => true
  });
  return { status: r.status, data: r.data };
}

function defaultTimesheetSummaryUrl() {
  return (
    env("MISA_TIMESHEET_SUMMARY_URL") ||
    "https://amisapp.misa.vn/APIS/TimesheetOpenAPI/api/Open/get-data-timesheet-summary"
  );
}

function defaultTimesheetSummaryDetailUrl() {
  return (
    env("MISA_TIMESHEET_SUMMARY_DETAIL_URL") ||
    "https://amisapp.misa.vn/APIS/TimesheetOpenAPI/api/Open/get-data-timesheet-summary-detail"
  );
}

function defaultTimesheetApplicationUrl() {
  return (
    env("MISA_TIMESHEET_APPLICATION_URL") ||
    "https://amisapp.misa.vn/APIS/TimesheetOpenAPI/api/Open/get-data-application"
  );
}

function defaultTimesheetDetailUrl() {
  return (
    env("MISA_TIMESHEET_DETAIL_URL") ||
    "https://amisapp.misa.vn/APIS/TimesheetOpenAPI/api/Open/get-data-timesheet-detail"
  );
}

module.exports = {
  buildMisaHeaders,
  fetchEmployeesFromMisa,
  postMisaOpenApi,
  defaultTimesheetSummaryUrl,
  defaultTimesheetSummaryDetailUrl,
  defaultTimesheetApplicationUrl,
  defaultTimesheetDetailUrl
};
