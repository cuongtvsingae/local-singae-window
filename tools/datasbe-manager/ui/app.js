(() => {
  const API = "/api/getfly-downloader";
  const $ = (id) => document.getElementById(id);

  const apiUrlEl = $("apiUrl");
  const apiKeyEl = $("apiKey");
  const limitEl = $("limit");
  const maxPagesEl = $("maxPages");
  const lastSyncDateEl = $("lastSyncDate");
  const logEl = $("log");
  const btnSync = $("btnSync");
  const tabSyncEl = $("tabSync");
  const tabSavedEl = $("tabSaved");
  const panelSyncEl = $("panelSync");
  const panelSavedEl = $("panelSaved");
  const savedHeadRowEl = $("savedHeadRow");
  const savedRowsEl = $("savedRows");
  const btnReloadSavedEl = $("btnReloadSaved");
  const savedDetailJsonEl = $("savedDetailJson");
  let savedKeys = [];

  function log(line) {
    if (!logEl) return;
    logEl.textContent = `[${new Date().toISOString()}] ${line}\n` + logEl.textContent;
  }

  async function request(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function loadConfig() {
    const cfg = await request("/config");
    if (apiUrlEl) apiUrlEl.value = cfg.apiUrl || "";
  }

  function setActiveTab(tab) {
    const showSaved = tab === "saved";
    tabSyncEl?.classList.toggle("is-active", !showSaved);
    tabSavedEl?.classList.toggle("is-active", showSaved);
    if (panelSyncEl) panelSyncEl.hidden = showSaved;
    if (panelSavedEl) panelSavedEl.hidden = !showSaved;
  }

  async function loadSavedCustomers() {
    const [keyPayload, payload] = await Promise.all([
      request("/customers/keys"),
      request("/customers?limit=200&offset=0&withRaw=1")
    ]);
    const keysFromDb = Array.isArray(keyPayload?.keys) ? keyPayload.keys : [];
    const fallback = ["account_code", "account_name", "phone_office", "email", "synced_at"];
    savedKeys = (keysFromDb.length ? keysFromDb : fallback).slice(0, 8);
    if (!savedKeys.includes("account_id")) savedKeys.unshift("account_id");
    if (!savedKeys.includes("account_code")) savedKeys.unshift("account_code");
    savedKeys = [...new Set(savedKeys)];
    if (savedHeadRowEl) {
      savedHeadRowEl.innerHTML = savedKeys.map((k) => `<th>${k}</th>`).join("");
    }
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!savedRowsEl) return;
    savedRowsEl.innerHTML = items.map((row) => {
      let raw = {};
      try {
        raw = row?.raw_json ? JSON.parse(row.raw_json) : {};
      } catch (_) {
        raw = {};
      }
      const accountId = String(row.account_id || raw.account_id || raw.id || "");
      const tds = savedKeys.map((k) => {
        const v = raw?.[k] ?? row?.[k] ?? "";
        if (v && typeof v === "object") return `<td>${JSON.stringify(v)}</td>`;
        return `<td>${String(v ?? "")}</td>`;
      }).join("");
      return `<tr data-account-id="${accountId}">${tds}</tr>`;
    }).join("");
    savedRowsEl.querySelectorAll("tr[data-account-id]").forEach((tr) => {
      tr.addEventListener("click", async () => {
        const accountId = String(tr.getAttribute("data-account-id") || "").trim();
        if (!accountId) return;
        try {
          const detail = await request(`/customers/${encodeURIComponent(accountId)}`);
          if (savedDetailJsonEl) savedDetailJsonEl.textContent = JSON.stringify(detail, null, 2);
          savedRowsEl.querySelectorAll("tr").forEach((x) => x.classList.remove("is-selected"));
          tr.classList.add("is-selected");
        } catch (error) {
          log(`Load customer detail failed: ${error.message}`);
        }
      });
    });
    log(`Đã tải ${items.length} khách hàng đã lưu.`);
  }

  btnSync?.addEventListener("click", async () => {
    btnSync.disabled = true;
    try {
      const pickedDate = String(lastSyncDateEl?.value || "").trim();
      const lastSync = pickedDate
        ? Math.floor(new Date(`${pickedDate}T00:00:00`).getTime() / 1000)
        : 0;
      const payload = {
        apiUrl: apiUrlEl?.value || "",
        apiKey: apiKeyEl?.value || "",
        limit: Number(limitEl?.value || 100),
        maxPages: Number(maxPagesEl?.value || 100),
        lastSync
      };
      log("Sync started...");
      const result = await request("/sync", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      log(`Sync done: lastSync=${result.lastSync || 0}, types=${result.totalAccountTypes}, pages=${result.totalPages}, received=${result.totalReceived}, detail=${result.totalDetailFetched}, saved=${result.totalSaved}`);
      log(`Đã lưu vào database: ${Number(result.totalSaved || 0)} khách hàng.`);
      const logPayload = result?.syncLog || {};
      if (logPayload.accountTypesEndpoint) {
        log(`Account types endpoint: ${logPayload.accountTypesEndpoint}`);
      }
      const pageLogs = Array.isArray(logPayload.pageLogs) ? logPayload.pageLogs : [];
      if (!pageLogs.length) {
        log("Detail: no page returned data from /api/v6/accounts/sync.");
      } else {
        pageLogs.forEach((p) => {
          log(`Page ${p.page}: received=${p.received}, detail=${p.detailFetched}, filteredBySource=${p.filteredBySource}, saved=${p.saved}`);
        });
      }
      await loadSavedCustomers();
    } catch (error) {
      log(`Sync failed: ${error.message}`);
    } finally {
      btnSync.disabled = false;
    }
  });

  tabSyncEl?.addEventListener("click", () => setActiveTab("sync"));
  tabSavedEl?.addEventListener("click", async () => {
    setActiveTab("saved");
    try {
      await loadSavedCustomers();
    } catch (error) {
      log(`Load saved list failed: ${error.message}`);
    }
  });
  btnReloadSavedEl?.addEventListener("click", async () => {
    try {
      await loadSavedCustomers();
    } catch (error) {
      log(`Reload saved list failed: ${error.message}`);
    }
  });

  (async () => {
    try {
      await loadConfig();
      if (lastSyncDateEl && !lastSyncDateEl.value) {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        lastSyncDateEl.value = `${yyyy}-${mm}-${dd}`;
      }
      setActiveTab("sync");
      log("Ready");
    } catch (error) {
      log(`Init failed: ${error.message}`);
    }
  })();
})();

