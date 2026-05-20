const express = require("express");
const fs = require("fs");
const path = require("path");
const { openSqliteDatabase } = require("../../../shared/server-base/openSqlite");

const router = express.Router();

const DB_DIR = path.resolve(__dirname, "..", "database");
const DB_FILE = path.join(DB_DIR, "getfly-downloader.sqlite");
// Use the exact same config source as singae-lookup.
const DEFAULT_API_URL =
  process.env.SINGAE_LOOKUP_GETFLY_API_URL || "https://sas9.getflycrm.com/api/v6/accounts";
const DEFAULT_API_KEY = process.env.SINGAE_LOOKUP_GETFLY_API_KEY || "";
const DEFAULT_WEBHOOK_URL = process.env.SINGAE_LOOKUP_WEBHOOK_URL || "";
const SYNC_FIELDS = [
  "account_code",
  "account_name",
  "description",
  "billing_address_street",
  "phone_office",
  "email",
  "mgr_email",
  "mgr_display_name",
  "website",
  "logo",
  "birthday",
  "sic_code",
  "created_at",
  "account_type",
  "account_source",
  "relation_id",
  "relation_name",
  "gender",
  "total_revenue",
  "contacts",
  "detail_custom_fields"
].join(",");
const DETAIL_FIELDS = [
  "id",
  "account_code",
  "account_name",
  "description",
  "billing_address_street",
  "phone_office",
  "email",
  "mgr_email",
  "mgr_display_name",
  "website",
  "logo",
  "birthday",
  "sic_code",
  "created_at",
  "account_type",
  "account_source",
  "relation_id",
  "relation_name",
  "gender",
  "total_revenue",
  "contacts",
  "account_manager",
  "accessible_user_ids",
  "custom_fields"
].join(",");
const LOOKUP_BY_CODE_FIELDS =
  "id,account_code,account_name,description,billing_address_street,phone_office,email,mgr_email,mgr_display_name,website,logo,birthday,sic_code,created_at,account_type,account_source,relation_id,relation_name,gender,total_revenue,contacts,account_manager,accessible_user_ids,custom_fields";

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const db = openSqliteDatabase(DB_FILE);
const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const AUTO_SYNC_RETRY_MS = 5 * 60 * 1000;
let isSyncRunning = false;
let autoSyncTimer = null;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function initSchema() {
  await run("PRAGMA journal_mode=WAL;");
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL UNIQUE,
      account_code TEXT,
      account_name TEXT,
      phone_office TEXT,
      relation_name TEXT,
      email TEXT,
      owner_name TEXT,
      address TEXT,
      source TEXT,
      created_date TEXT,
      updated_date TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      message TEXT,
      total_received INTEGER NOT NULL DEFAULT 0,
      total_saved INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER NOT NULL DEFAULT 0,
      page_size INTEGER NOT NULL DEFAULT 100,
      api_url TEXT,
      initiated_by TEXT
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_success_synced_at TEXT
    );
  `);
  await run(`
    INSERT INTO sync_state(id, last_success_synced_at)
    VALUES(1, NULL)
    ON CONFLICT(id) DO NOTHING;
  `);
}

function cleanBaseUrl(input) {
  return String(input || "").trim().replace(/\/+$/, "");
}

function normalizeAccountsBaseUrl(input) {
  const raw = cleanBaseUrl(input);
  const u = new URL(raw);
  let p = String(u.pathname || "").replace(/\/+$/, "");
  p = p.replace(/\/api\/v6\/accounts\/sync$/i, "/api/v6/accounts");
  p = p.replace(/\/api\/v6\/accounts\/types$/i, "/api/v6/accounts");
  p = p.replace(/\/api\/v6\/accounts\/\d+$/i, "/api/v6/accounts");
  if (!/\/api\/v6\/accounts$/i.test(p)) {
    p = "/api/v6/accounts";
  }
  u.pathname = p;
  u.search = "";
  u.hash = "";
  return String(u).replace(/\/+$/, "");
}

function normalizeAccount(item) {
  const row = item && typeof item === "object" ? item : {};
  const syncedAt = new Date().toISOString();
  const rawWithSync = {
    ...row,
    last_synced_at: syncedAt
  };
  const accountId = row.account_id ?? row.id ?? row.accountId ?? row.accountID;
  return {
    accountId: accountId == null ? "" : String(accountId),
    accountCode: row.account_code == null ? null : String(row.account_code),
    accountName: row.account_name == null ? null : String(row.account_name),
    phoneOffice: row.phone_office == null ? null : String(row.phone_office),
    relationName: row.relation_name == null ? null : String(row.relation_name),
    email: row.email == null ? null : String(row.email),
    ownerName: row.owner_name == null ? null : String(row.owner_name),
    address: row.address == null ? null : String(row.address),
    source: row.source == null ? null : String(row.source),
    createdDate: row.created_date == null ? null : String(row.created_date),
    updatedDate: row.updated_date == null ? null : String(row.updated_date),
    rawJson: JSON.stringify(rawWithSync),
    syncedAt
  };
}

function isSparseSyncItem(item) {
  const row = item && typeof item === "object" ? item : {};
  const keys = Object.keys(row);
  if (!keys.length) return true;
  if (keys.length <= 2 && (Object.prototype.hasOwnProperty.call(row, "id") || Object.prototype.hasOwnProperty.call(row, "account_id"))) {
    return true;
  }
  const hasMeaningful =
    row.account_code || row.account_name || row.phone_office || row.email || row.relation_name || row.billing_address_street;
  return !hasMeaningful;
}

function buildAccountDetailUrl(baseUrl, id) {
  const base = new URL(normalizeAccountsBaseUrl(baseUrl));
  const pathname = String(base.pathname || "");
  const normalizedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  base.pathname = `${normalizedPath}/${encodeURIComponent(String(id))}`;
  base.search = "";
  base.searchParams.set("fields", DETAIL_FIELDS);
  return String(base);
}

function buildAccountTypesUrl(baseUrl) {
  const base = new URL(normalizeAccountsBaseUrl(baseUrl));
  base.pathname = "/api/v6/accounts/types";
  base.search = "";
  base.searchParams.set(
    "fields",
    "id,level,account_type_name,account_type_code,description,invalid,parent_id,created_at,updated_at,deleted_at,deleted_by"
  );
  base.searchParams.set("limit", "500");
  base.searchParams.set("offset", "0");
  return String(base);
}

function buildAccountByCodeUrl(baseUrl, accountCode) {
  const base = new URL(normalizeAccountsBaseUrl(baseUrl));
  base.pathname = "/api/v6/accounts";
  base.search = "";
  base.searchParams.set("filtering[account_code:eq]", String(accountCode || "").trim());
  base.searchParams.set("fields", LOOKUP_BY_CODE_FIELDS);
  base.searchParams.set("limit", "4");
  return String(base);
}

function normalizeLastSyncTimestamp(input) {
  const raw = String(input || "").trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor(parsed / 1000);
}

function buildAccountsSyncUrl(baseUrl, { lastSync, limit, offset }) {
  const base = new URL(normalizeAccountsBaseUrl(baseUrl));
  base.pathname = "/api/v6/accounts/sync";
  base.search = "";
  base.searchParams.set("limit", String(Math.max(1, Number(limit || 100))));
  base.searchParams.set("offset", String(Math.max(0, Number(offset || 0))));
  if (Number(lastSync) > 0) {
    base.searchParams.set("filtering[last_sync]", String(lastSync));
  }
  return String(base);
}

async function fetchGetflyJson(endpoint, apiKey) {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Getfly ${response.status}: ${text.slice(0, 500)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`parse_error: ${error.message}`);
  }
}

async function fetchAccountByCode(baseUrl, apiKey, accountCode) {
  const endpoint = buildAccountByCodeUrl(baseUrl, accountCode);
  const body = await fetchGetflyJson(endpoint, apiKey);
  const list = Array.isArray(body?.data) ? body.data : [];
  return { endpoint, account: list[0] || null, raw: body };
}

async function upsertCustomer(customer) {
  if (!customer.accountId) return 0;
  const result = await run(
    `
      INSERT INTO customers(
        account_id, account_code, account_name, phone_office, relation_name,
        email, owner_name, address, source, created_date, updated_date, raw_json, synced_at
      )
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET
        account_code=excluded.account_code,
        account_name=excluded.account_name,
        phone_office=excluded.phone_office,
        relation_name=excluded.relation_name,
        email=excluded.email,
        owner_name=excluded.owner_name,
        address=excluded.address,
        source=excluded.source,
        created_date=excluded.created_date,
        updated_date=excluded.updated_date,
        raw_json=excluded.raw_json,
        synced_at=excluded.synced_at
    `,
    [
      customer.accountId,
      customer.accountCode,
      customer.accountName,
      customer.phoneOffice,
      customer.relationName,
      customer.email,
      customer.ownerName,
      customer.address,
      customer.source,
      customer.createdDate,
      customer.updatedDate,
      customer.rawJson,
      customer.syncedAt
    ]
  );
  return result.changes || 0;
}

async function getLastSuccessfulSyncAt() {
  const state = await get(`SELECT last_success_synced_at FROM sync_state WHERE id = 1 LIMIT 1`);
  if (state?.last_success_synced_at) return String(state.last_success_synced_at);
  const lastRun = await get(`SELECT ended_at FROM sync_runs WHERE status = 'done' ORDER BY id DESC LIMIT 1`);
  return lastRun?.ended_at ? String(lastRun.ended_at) : null;
}

async function markSuccessfulSyncAt(isoTime) {
  await run(`UPDATE sync_state SET last_success_synced_at = ? WHERE id = 1`, [String(isoTime || "")]);
}

function scheduleAutoSyncFrom(lastSuccessIso) {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  const lastTs = Date.parse(String(lastSuccessIso || ""));
  const now = Date.now();
  const delay = Number.isNaN(lastTs)
    ? 0
    : Math.max(0, AUTO_SYNC_INTERVAL_MS - (now - lastTs));
  autoSyncTimer = setTimeout(async () => {
    try {
      await performSync({
        baseUrl: DEFAULT_API_URL,
        apiKey: DEFAULT_API_KEY,
        limit: 100,
        maxPages: 100,
        initiatedBy: "auto-sync"
      });
    } catch (_) {
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      autoSyncTimer = setTimeout(async () => {
        try {
          await performSync({
            baseUrl: DEFAULT_API_URL,
            apiKey: DEFAULT_API_KEY,
            limit: 100,
            maxPages: 100,
            initiatedBy: "auto-sync-retry"
          });
        } catch (_) {
          scheduleAutoSyncFrom(await getLastSuccessfulSyncAt());
        }
      }, AUTO_SYNC_RETRY_MS);
    }
  }, delay);
}

async function startAutoSyncScheduler() {
  if (!DEFAULT_API_URL || !DEFAULT_API_KEY) return;
  const lastSuccess = await getLastSuccessfulSyncAt();
  scheduleAutoSyncFrom(lastSuccess);
}

async function performSync({ baseUrl, apiKey, limit, maxPages, initiatedBy, requestedLastSync }) {
  if (isSyncRunning) {
    throw new Error("sync_in_progress");
  }
  isSyncRunning = true;
  const startedAt = new Date().toISOString();
  const requested = normalizeLastSyncTimestamp(requestedLastSync);
  const previousSuccess = await getLastSuccessfulSyncAt();
  const fallbackLastSync = previousSuccess ? Math.floor(Date.parse(previousSuccess) / 1000) : 0;
  const lastSync = requested > 0 ? requested : fallbackLastSync;
  let runId = 0;
  try {
    const inserted = await run(
      `INSERT INTO sync_runs(started_at, status, message, page_size, api_url, initiated_by) VALUES(?,?,?,?,?,?)`,
      [startedAt, "running", "started", limit, baseUrl, initiatedBy]
    );
    runId = inserted.lastID || 0;

    let totalReceived = 0;
    let totalSaved = 0;
    let totalDetailFetched = 0;
    let totalLookupByCodeFetched = 0;
    let totalLookupByCodeHit = 0;
    let pages = 0;
    const pageLogs = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const offset = (page - 1) * limit;
      const syncUrl = buildAccountsSyncUrl(baseUrl, { lastSync, limit, offset });
      // eslint-disable-next-line no-await-in-loop
      const body = await fetchGetflyJson(syncUrl, apiKey);
      const items = Array.isArray(body?.data)
        ? body.data
        : (Array.isArray(body?.accounts) ? body.accounts : (Array.isArray(body) ? body : []));
      if (!items.length) break;
      totalReceived += items.length;
      pages = page;
      let pageSaved = 0;
      let pageDetailFetched = 0;
      let pageLookupByCodeFetched = 0;
      let pageLookupByCodeHit = 0;
      for (const item of items) {
        let sourceItem = item;
        const accountId = item?.id ?? item?.account_id ?? item?.accountId;
        if (accountId != null && String(accountId).trim()) {
          const generatedCode = `KH${String(accountId).trim()}`;
          try {
            // eslint-disable-next-line no-await-in-loop
            const lookup = await fetchAccountByCode(baseUrl, apiKey, generatedCode);
            totalLookupByCodeFetched += 1;
            pageLookupByCodeFetched += 1;
            if (lookup.account && typeof lookup.account === "object") {
              sourceItem = lookup.account;
              totalLookupByCodeHit += 1;
              pageLookupByCodeHit += 1;
            }
          } catch (_) {
            // ignore lookup by code failure, continue fallback below
          }
        }
        if (isSparseSyncItem(sourceItem) && accountId != null && String(accountId).trim()) {
          const detailUrl = buildAccountDetailUrl(baseUrl, accountId);
          // eslint-disable-next-line no-await-in-loop
          const detailBody = await fetchGetflyJson(detailUrl, apiKey);
          const detail = detailBody?.data && typeof detailBody.data === "object" ? detailBody.data : detailBody;
          if (detail && typeof detail === "object") sourceItem = detail;
          totalDetailFetched += 1;
          pageDetailFetched += 1;
        }
        const customer = normalizeAccount(sourceItem);
        // eslint-disable-next-line no-await-in-loop
        const changed = await upsertCustomer(customer);
        totalSaved += changed;
        pageSaved += changed;
      }
      pageLogs.push({
        page,
        offset,
        received: items.length,
        detailFetched: pageDetailFetched,
        lookupByCodeFetched: pageLookupByCodeFetched,
        lookupByCodeHit: pageLookupByCodeHit,
        filteredBySource: 0,
        saved: pageSaved,
        syncEndpoint: syncUrl
      });
      if (items.length < limit) break;
    }

    const endedAt = new Date().toISOString();
    await run(
      `
      UPDATE sync_runs
      SET ended_at = ?, status = ?, message = ?, total_received = ?, total_saved = ?, total_pages = ?
      WHERE id = ?
      `,
      [endedAt, "done", "completed", totalReceived, totalSaved, pages, runId]
    );
    await markSuccessfulSyncAt(endedAt);
    scheduleAutoSyncFrom(endedAt);
    return {
      ok: true,
      runId,
      startedAt,
      endedAt,
      totalReceived,
      totalSaved,
      totalPages: pages,
      totalDetailFetched,
      totalLookupByCodeFetched,
      totalLookupByCodeHit,
      totalAccountTypes: 0,
      lastSync,
      syncLog: {
        requiredAccountSource: null,
        accountTypesEndpoint: null,
        pageLogs
      }
    };
  } catch (error) {
    if (runId) {
      await run(
        `UPDATE sync_runs SET ended_at = ?, status = ?, message = ? WHERE id = ?`,
        [new Date().toISOString(), "failed", String(error.message || "unknown_error"), runId]
      );
    }
    scheduleAutoSyncFrom(await getLastSuccessfulSyncAt());
    throw error;
  } finally {
    isSyncRunning = false;
  }
}

router.get("/config", async (req, res) => {
  res.json({
    apiUrl: DEFAULT_API_URL,
    apiKeyPreset: DEFAULT_API_KEY ? `${DEFAULT_API_KEY.slice(0, 4)}...` : "",
    hasApiKey: Boolean(DEFAULT_API_KEY),
    webhookUrl: DEFAULT_WEBHOOK_URL
  });
});

router.get("/stats", async (req, res) => {
  try {
    const total = await get(`SELECT COUNT(*) AS c FROM customers`);
    const latest = await get(`SELECT synced_at FROM customers ORDER BY synced_at DESC LIMIT 1`);
    const run = await get(`SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1`);
    res.json({
      totalCustomers: Number(total?.c || 0),
      latestSyncedAt: latest?.synced_at || null,
      lastRun: run || null
    });
  } catch (error) {
    res.status(500).json({ error: "cannot_load_stats", message: error.message });
  }
});

router.get("/customers", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 50)));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const withRaw = String(req.query?.withRaw || "").trim() === "1";
    const rows = await all(
      `
      SELECT account_id, account_code, account_name, phone_office, relation_name, email, owner_name, synced_at, raw_json
      FROM customers
      ORDER BY id DESC
      LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );
    const items = withRaw
      ? rows
      : rows.map((row) => {
        const { raw_json, ...rest } = row;
        return rest;
      });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: "cannot_load_customers", message: error.message });
  }
});

router.get("/customers/keys", async (_req, res) => {
  try {
    const row = await get(`SELECT raw_json FROM customers WHERE raw_json IS NOT NULL AND raw_json <> '' ORDER BY id DESC LIMIT 1`);
    if (!row?.raw_json) return res.json({ keys: [] });
    let parsed = {};
    try {
      parsed = JSON.parse(row.raw_json);
    } catch {
      parsed = {};
    }
    const keys = Object.keys(parsed || {});
    return res.json({ keys });
  } catch (error) {
    return res.status(500).json({ error: "cannot_load_keys", message: error.message });
  }
});

router.get("/customers/:accountId", async (req, res) => {
  try {
    const accountId = String(req.params?.accountId || "").trim();
    if (!accountId) return res.status(400).json({ error: "missing_account_id" });
    const row = await get(
      `
      SELECT account_id, account_code, account_name, phone_office, relation_name, email, owner_name, synced_at, raw_json
      FROM customers
      WHERE account_id = ?
      LIMIT 1
      `,
      [accountId]
    );
    if (!row) return res.status(404).json({ error: "not_found" });
    let raw = {};
    try {
      raw = row.raw_json ? JSON.parse(row.raw_json) : {};
    } catch {
      raw = {};
    }
    return res.json({ customer: row, raw });
  } catch (error) {
    return res.status(500).json({ error: "cannot_load_customer_detail", message: error.message });
  }
});

router.post("/account-types", async (req, res) => {
  const baseUrl = cleanBaseUrl(req.body?.apiUrl || DEFAULT_API_URL);
  const apiKey = String(req.body?.apiKey || DEFAULT_API_KEY || "").trim();
  if (!baseUrl) return res.status(400).json({ error: "missing_api_url" });
  if (!apiKey) return res.status(400).json({ error: "missing_api_key" });
  const endpoint = buildAccountTypesUrl(baseUrl);
  try {
    const body = await fetchGetflyJson(endpoint, apiKey);
    const items = Array.isArray(body)
      ? body
      : (Array.isArray(body?.data) ? body.data : (Array.isArray(body?.account_types) ? body.account_types : []));
    return res.json({ endpoint, items });
  } catch (error) {
    return res.status(500).json({ error: "account_types_failed", message: error.message, endpoint });
  }
});

router.post("/account-detail", async (req, res) => {
  const id = Number(req.query?.id || req.body?.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "invalid_id", message: "Customer id is required." });
  }
  const baseUrl = cleanBaseUrl(req.body?.apiUrl || DEFAULT_API_URL);
  const apiKey = String(req.body?.apiKey || DEFAULT_API_KEY || "").trim();
  if (!baseUrl) return res.status(400).json({ error: "missing_api_url" });
  if (!apiKey) return res.status(400).json({ error: "missing_api_key" });
  const endpoint = buildAccountDetailUrl(baseUrl, id);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      }
    });
    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "detail_failed",
        message: `Getfly ${response.status}`,
        endpoint,
        response: text
      });
    }
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      return res.status(500).json({ error: "parse_error", message: error.message, endpoint, response: text });
    }
    return res.json({ endpoint, data: body });
  } catch (error) {
    return res.status(500).json({ error: "detail_failed", message: error.message, endpoint });
  }
});

router.post("/sync", async (req, res) => {
  const baseUrl = cleanBaseUrl(req.body?.apiUrl || DEFAULT_API_URL);
  const apiKey = String(req.body?.apiKey || DEFAULT_API_KEY || "").trim();
  const limit = Math.max(1, Math.min(200, Number(req.body?.limit || 100)));
  const maxPages = Math.max(1, Math.min(500, Number(req.body?.maxPages || 100)));
  const initiatedBy = String(req.body?.username || req.authUser?.username || "").trim().toLowerCase();

  if (!baseUrl) return res.status(400).json({ error: "missing_api_url" });
  if (!apiKey) return res.status(400).json({ error: "missing_api_key" });
  try {
    const result = await performSync({
      baseUrl,
      apiKey,
      limit,
      maxPages,
      initiatedBy,
      requestedLastSync: req.body?.lastSync
    });
    res.json(result);
  } catch (error) {
    if (String(error.message || "") === "sync_in_progress") {
      return res.status(409).json({ error: "sync_in_progress", message: "A sync run is already running." });
    }
    res.status(500).json({ error: "sync_failed", message: error.message });
  }
});

initSchema()
  .then(() => startAutoSyncScheduler())
  .catch((error) => {
    // Keep server alive but expose failure in startup logs.
    console.error("[getfly-downloader] init/scheduler failed:", error);
  });

module.exports = router;

