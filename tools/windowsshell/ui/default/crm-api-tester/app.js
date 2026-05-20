(() => {
  const LS_KEY = 'crm_api_tester_config_v1';
  const LS_LAST_TAB = 'crm_api_tester_last_tab_v1';

  const $ = (id) => document.getElementById(id);

  function safeJsonParse(text, fallback = null) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return fallback;
    }
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch (_) {
      return String(Date.now());
    }
  }

  function prettyAny(text) {
    const json = safeJsonParse(text, null);
    if (json !== null) return JSON.stringify(json, null, 2);
    return text;
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function http(url, opts) {
    // Always go through same-origin proxy to avoid CORS when calling external CRM APIs
    const proxiedUrl = `/api/crmtester/proxy?url=${encodeURIComponent(url)}`;
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const res = await fetch(proxiedUrl, opts);
    const text = await res.text();
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const ms = Math.max(0, Math.round(t1 - t0));
    return { res, text, ms };
  }

  function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function appendLog(containerEl, entry) {
    const el = document.createElement('div');
    el.className = 'crm-log';
    const ok = entry.ok;
    const status = entry.status ?? 'ERR';
    const method = entry.method || '';
    const name = entry.name || '';
    const url = entry.url || '';
    const body = entry.body || '';
    el.innerHTML = `
      <div class="crm-log-head">
        <span class="crm-pill ${ok ? 'ok' : 'bad'}">${method} • ${status}</span>
        <span class="crm-log-url">${escapeHtml(name)}${name ? ' — ' : ''}${escapeHtml(url)}</span>
      </div>
      <div class="crm-log-body"><pre style="margin:0">${escapeHtml(body)}</pre></div>
      <div class="crm-log-url" style="margin-top:6px; opacity:.7">${escapeHtml(entry.at || '')}</div>
    `;
    containerEl.prepend(el);
  }

  function setPresetInlineResponse(presetId, payload) {
    const el = document.querySelector(`[data-preset-id="${presetId}"] .crm-preset-response`);
    if (!el) return;
    const status = payload?.status ?? 'ERR';
    const ok = !!payload?.ok;
    const ms = typeof payload?.ms === 'number' ? payload.ms : null;
    const head = `${payload?.method || ''} • ${status}${ms !== null ? ` • ${ms}ms` : ''}${payload?.url ? ` • ${payload.url}` : ''}`;
    const body = payload?.body || '';
    el.hidden = false;
    el.innerHTML = `<div class="crm-preset-response-head ${ok ? 'ok' : 'bad'}">${escapeHtml(head)}</div><pre class="crm-preset-response-body">${escapeHtml(body)}</pre>`;
  }

  function clearPresetInlineResponse(presetId) {
    const el = document.querySelector(`[data-preset-id="${presetId}"] .crm-preset-response`);
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
  }

  function buildCurlPreview({ method, url, headers, body }) {
    const lines = [];
    lines.push(`curl -X ${method} "${url}"`);
    const h = headers || {};
    Object.keys(h).forEach((k) => {
      const v = h[k];
      if (v === undefined || v === null || String(v) === '') return;
      lines.push(`  -H "${String(k).replaceAll('"', '\\"')}: ${String(v).replaceAll('"', '\\"')}"`);
    });
    if (body !== undefined && body !== null && String(body).trim()) {
      lines.push(`  --data '${String(body).replaceAll("'", "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function defaultConfig() {
    return {
      simly: {
        baseUrl: 'https://api.simlydent.vn',
        apiKey: '',
        accessToken: '',
        patientSearch: 'KH08112025',
        patientPage: '1',
        patientPageSize: '100'
      },
      getfly: {
        baseUrl: 'https://sas9.getflycrm.com',
        authMode: 'x-api-key', // x-api-key | bearer | authorization | none
        apiKey: '',
        bearer: '',
        authorizationRaw: '',
        queryToken: '',
        presets: buildDefaultGetflyPresets()
      }
    };
  }

  function buildDefaultGetflyPresets() {
    // NOTE: The exact Customer v6.0 endpoints may differ by account/version.
    // These presets are editable in UI. "safe" runner will only execute GET.
    return [
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Users - List (GET /api/v6/users)',
        method: 'GET',
        path: '/api/v6/users',
        query: '{\n  "fields": "contact_name",\n  "filtering": {\n    "id": 2,\n    "contact_name:contains": "Lê"\n  },\n  "limit": 1,\n  "offset": 1\n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - List (GET /api/v6/accounts)',
        method: 'GET',
        path: '/api/v6/accounts',
        query: '{\n  "fields": "account_name,custom_fields",\n  "filtering": {\n    "id": 4\n  },\n  "limit": 1,\n  "offset": 1\n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Create (POST /api/v6/accounts) (danger)',
        method: 'POST',
        path: '/api/v6/accounts',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_name": "TEST ACCOUNT API",\n  "custom_fields": {\n    "field_1": 111\n  },\n  "contacts": [\n    {\n      "first_name": "TEST CONTACT API"\n    }\n  ]\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Detail (GET /api/v6/accounts/{id})',
        method: 'GET',
        // Tip: replace 4 with your real account id
        path: '/api/v6/accounts/4',
        query: '{\n  "fields": "account_name,custom_fields"\n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Update by ID (PUT /api/v6/accounts/{id}) (danger)',
        method: 'PUT',
        // Tip: replace 4 with your real account id
        path: '/api/v6/accounts/4',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_name": "TEST ACCOUNT API",\n  "custom_fields": {\n    "field_1": 111\n  },\n  "added_contacts": [\n    {\n      "first_name": "TEST CONTACT API"\n    }\n  ]\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Update by Code (PUT /api/v6/accounts) (danger)',
        method: 'PUT',
        path: '/api/v6/accounts',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_code": "ACCOUNT_CODE",\n  "account_name": "TEST ACCOUNT API"\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Delete (DELETE /api/v6/accounts/{id}) (danger)',
        method: 'DELETE',
        path: '/api/v6/accounts/4',
        query: '{\n  \n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Restore (POST /api/v6/accounts/{id}/restore) (danger)',
        method: 'POST',
        path: '/api/v6/accounts/4/restore',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  \n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Change manager (POST /api/v6/accounts/{id}/manager) (danger)',
        method: 'POST',
        path: '/api/v6/accounts/4/manager',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_manager": 1\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Types list (GET /api/v6/accounts/types)',
        method: 'GET',
        path: '/api/v6/accounts/types',
        query: '{\n  \n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Types create (POST /api/v6/accounts/types) (danger)',
        method: 'POST',
        path: '/api/v6/accounts/types',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_type_name": "TEST ACCOUNT TYPE",\n  "account_type_code": "TEST_ACCOUNT_TYPE"\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Types update by ID (PUT /api/v6/accounts/types/{id}) (danger)',
        method: 'PUT',
        path: '/api/v6/accounts/types/4',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_type_name": "TEST ACCOUNT TYPE"\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Types update by code (PUT /api/v6/accounts/types) (danger)',
        method: 'PUT',
        path: '/api/v6/accounts/types',
        query: '{\n  \n}\n',
        headers: '{\n  "Content-Type": "application/json"\n}\n',
        body: '{\n  "account_type_name": "TEST ACCOUNT TYPE",\n  "account_type_code": "TEST_ACCOUNT_TYPE"\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Types delete (DELETE /api/v6/accounts/types/{id}) (danger)',
        method: 'DELETE',
        path: '/api/v6/accounts/types/4',
        query: '{\n  \n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Relations list (GET /api/v6/accounts/relations)',
        method: 'GET',
        path: '/api/v6/accounts/relations',
        query: '{\n  \n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Sources list (GET /api/v6/accounts/sources)',
        method: 'GET',
        path: '/api/v6/accounts/sources',
        query: '{\n  \n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Count orders status (GET /api/v6/accounts/{id}/count_orders_status)',
        method: 'GET',
        path: '/api/v6/accounts/4/count_orders_status',
        query: '{\n  \n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Sync (GET /api/v6/accounts/sync)',
        method: 'GET',
        path: '/api/v6/accounts/sync',
        query: '{\n  "filtering": {\n    "last_sync": 1699554513\n  }\n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Deleted IDs sync (GET /api/v6/accounts/deleted_ids)',
        method: 'GET',
        path: '/api/v6/accounts/deleted_ids',
        query: '{\n  "filtering": {\n    "last_sync": 1699554513\n  }\n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Accounts - Comments list (GET /api/v6/accounts/{id}/comments)',
        method: 'GET',
        path: '/api/v6/accounts/1/comments',
        query: '{\n  "fields": "content",\n  "filtering": {\n    "is_feedback": 0\n  },\n  "limit": 1,\n  "offset": 1\n}\n',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Accounts - Comment create (POST /api/v6/accounts/{id}/comments) (danger)',
        method: 'POST',
        path: '/api/v6/accounts/1/comments',
        query: '{\n  \n}\n',
        headers: '{\n  \"Content-Type\": \"application/json\"\n}\n',
        body: '{\n  \"content\": \"TEST\",\n  \"user_id\": 1\n}\n'
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Customer - List (fill path from docs)',
        method: 'GET',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Customer - Create (fill path from docs)',
        method: 'POST',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  "Content-Type": "application/json"\n}',
        body: '{\n  \n}'
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Customer - Detail (fill path from docs)',
        method: 'GET',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: true,
        selected: false,
        name: 'Customer - Update (fill path from docs)',
        method: 'PUT',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  "Content-Type": "application/json"\n}',
        body: '{\n  \n}'
      },
      {
        id: uid(),
        enabled: false,
        selected: false,
        name: 'Customer - Delete (danger)',
        method: 'DELETE',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  \n}',
        body: ''
      },
      {
        id: uid(),
        enabled: false,
        selected: false,
        name: 'Customer - Restore (danger)',
        method: 'POST',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  "Content-Type": "application/json"\n}',
        body: '{\n  \n}'
      },
      {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'Legacy sample - GET /api/v3/account (from your Postman)',
        method: 'GET',
        path: '/api/v3/account',
        query: '{\n  "account_code": "KH1999885"\n}',
        headers: '{\n  \n}',
        body: ''
      }
    ];
  }

  function loadConfig() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultConfig();
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== 'object') return defaultConfig();
    const cfg = defaultConfig();
    // merge shallow + nested
    cfg.simly = { ...cfg.simly, ...(parsed.simly || {}) };
    cfg.getfly = { ...cfg.getfly, ...(parsed.getfly || {}) };
    if (!Array.isArray(cfg.getfly.presets) || !cfg.getfly.presets.length) {
      cfg.getfly.presets = buildDefaultGetflyPresets();
    }
    // Migration: ensure core v6 presets exist even if user already has old config saved
    try {
      const presets = Array.isArray(cfg.getfly.presets) ? cfg.getfly.presets : [];
      const hasUsers = presets.some((p) => String(p?.path || '') === '/api/v6/users');
      const hasAccounts = presets.some((p) => String(p?.path || '') === '/api/v6/accounts');
      const hasAccountsCreate = presets.some(
        (p) => String(p?.path || '') === '/api/v6/accounts' && String(p?.method || '').toUpperCase() === 'POST'
      );
      const hasAccountsDetail = presets.some(
        (p) =>
          String(p?.method || '').toUpperCase() === 'GET' &&
          /^\/api\/v6\/accounts\/\d+/.test(String(p?.path || ''))
      );
      const hasAccountsUpdateById = presets.some(
        (p) =>
          String(p?.method || '').toUpperCase() === 'PUT' &&
          /^\/api\/v6\/accounts\/\d+/.test(String(p?.path || ''))
      );
      const hasAccountsUpdateByCode = presets.some(
        (p) =>
          String(p?.method || '').toUpperCase() === 'PUT' &&
          String(p?.path || '') === '/api/v6/accounts' &&
          String(p?.body || '').includes('"account_code"')
      );
      const hasAccountsDelete = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'DELETE' && /^\/api\/v6\/accounts\/\d+/.test(String(p?.path || ''))
      );
      const hasAccountsRestore = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'POST' && /\/api\/v6\/accounts\/\d+\/restore$/.test(String(p?.path || ''))
      );
      const hasAccountsManager = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'POST' && /\/api\/v6\/accounts\/\d+\/manager$/.test(String(p?.path || ''))
      );
      const hasAccountTypesList = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'GET' && String(p?.path || '') === '/api/v6/accounts/types'
      );
      const hasAccountTypesCreate = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'POST' && String(p?.path || '') === '/api/v6/accounts/types'
      );
      const hasAccountTypesUpdateById = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'PUT' && /^\/api\/v6\/accounts\/types\/\d+/.test(String(p?.path || ''))
      );
      const hasAccountTypesUpdateByCode = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'PUT' && String(p?.path || '') === '/api/v6/accounts/types'
      );
      const hasAccountTypesDelete = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'DELETE' && /^\/api\/v6\/accounts\/types\/\d+/.test(String(p?.path || ''))
      );
      const hasRelationsList = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'GET' && String(p?.path || '') === '/api/v6/accounts/relations'
      );
      const hasSourcesList = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'GET' && String(p?.path || '') === '/api/v6/accounts/sources'
      );
      const hasCountOrdersStatus = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'GET' && /\/api\/v6\/accounts\/\d+\/count_orders_status$/.test(String(p?.path || ''))
      );
      const hasAccountsSync = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'GET' && String(p?.path || '') === '/api/v6/accounts/sync'
      );
      const hasAccountsDeletedIds = presets.some(
        (p) => String(p?.method || '').toUpperCase() === 'GET' && String(p?.path || '') === '/api/v6/accounts/deleted_ids'
      );
      const hasAccountsCommentsList = presets.some(
        (p) =>
          String(p?.method || '').toUpperCase() === 'GET' &&
          /\/api\/v6\/accounts\/\d+\/comments$/.test(String(p?.path || ''))
      );
      const hasAccountsCommentsCreate = presets.some(
        (p) =>
          String(p?.method || '').toUpperCase() === 'POST' &&
          /\/api\/v6\/accounts\/\d+\/comments$/.test(String(p?.path || ''))
      );
      const defaults = buildDefaultGetflyPresets();
      if (!hasUsers) {
        const p = defaults.find((x) => x.path === '/api/v6/users');
        if (p) presets.unshift(p);
      }
      if (!hasAccounts) {
        const p = defaults.find((x) => x.path === '/api/v6/accounts');
        if (p) presets.unshift(p);
      }
      if (!hasAccountsCreate) {
        const p = defaults.find((x) => x.path === '/api/v6/accounts' && String(x.method || '').toUpperCase() === 'POST');
        if (p) presets.unshift(p);
      }
      if (!hasAccountsDetail) {
        const p = defaults.find((x) => String(x?.path || '').startsWith('/api/v6/accounts/') && String(x.method || '').toUpperCase() === 'GET');
        if (p) presets.unshift(p);
      }
      if (!hasAccountsUpdateById) {
        const p = defaults.find(
          (x) => String(x?.path || '').startsWith('/api/v6/accounts/') && String(x.method || '').toUpperCase() === 'PUT'
        );
        if (p) presets.unshift(p);
      }
      if (!hasAccountsUpdateByCode) {
        const p = defaults.find(
          (x) => String(x?.path || '') === '/api/v6/accounts' && String(x.method || '').toUpperCase() === 'PUT'
        );
        if (p) presets.unshift(p);
      }
      if (!hasAccountsDelete) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'DELETE' && String(x?.path || '').startsWith('/api/v6/accounts/'));
        if (p) presets.unshift(p);
      }
      if (!hasAccountsRestore) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'POST' && /\/restore$/.test(String(x?.path || '')));
        if (p) presets.unshift(p);
      }
      if (!hasAccountsManager) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'POST' && /\/manager$/.test(String(x?.path || '')));
        if (p) presets.unshift(p);
      }
      if (!hasAccountTypesList) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'GET' && String(x?.path || '') === '/api/v6/accounts/types');
        if (p) presets.unshift(p);
      }
      if (!hasAccountTypesCreate) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'POST' && String(x?.path || '') === '/api/v6/accounts/types');
        if (p) presets.unshift(p);
      }
      if (!hasAccountTypesUpdateById) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'PUT' && String(x?.path || '').startsWith('/api/v6/accounts/types/'));
        if (p) presets.unshift(p);
      }
      if (!hasAccountTypesUpdateByCode) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'PUT' && String(x?.path || '') === '/api/v6/accounts/types');
        if (p) presets.unshift(p);
      }
      if (!hasAccountTypesDelete) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'DELETE' && String(x?.path || '').startsWith('/api/v6/accounts/types/'));
        if (p) presets.unshift(p);
      }
      if (!hasRelationsList) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'GET' && String(x?.path || '') === '/api/v6/accounts/relations');
        if (p) presets.unshift(p);
      }
      if (!hasSourcesList) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'GET' && String(x?.path || '') === '/api/v6/accounts/sources');
        if (p) presets.unshift(p);
      }
      if (!hasCountOrdersStatus) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'GET' && /count_orders_status$/.test(String(x?.path || '')));
        if (p) presets.unshift(p);
      }
      if (!hasAccountsSync) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'GET' && String(x?.path || '') === '/api/v6/accounts/sync');
        if (p) presets.unshift(p);
      }
      if (!hasAccountsDeletedIds) {
        const p = defaults.find((x) => String(x.method || '').toUpperCase() === 'GET' && String(x?.path || '') === '/api/v6/accounts/deleted_ids');
        if (p) presets.unshift(p);
      }
      if (!hasAccountsCommentsList) {
        const p = defaults.find(
          (x) => String(x.method || '').toUpperCase() === 'GET' && /\/api\/v6\/accounts\/\d+\/comments$/.test(String(x?.path || ''))
        );
        if (p) presets.unshift(p);
      }
      if (!hasAccountsCommentsCreate) {
        const p = defaults.find(
          (x) => String(x.method || '').toUpperCase() === 'POST' && /\/api\/v6\/accounts\/\d+\/comments$/.test(String(x?.path || ''))
        );
        if (p) presets.unshift(p);
      }
      cfg.getfly.presets = presets;
    } catch (_) {}
    return cfg;
  }

  function saveConfig(cfg) {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }

  function uid() {
    return Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
  }

  function setActiveTab(tab) {
    const isSim = tab === 'simly';
    $('tab-simly').classList.toggle('is-active', isSim);
    $('tab-getfly').classList.toggle('is-active', !isSim);
    $('tab-simly').setAttribute('aria-selected', isSim ? 'true' : 'false');
    $('tab-getfly').setAttribute('aria-selected', !isSim ? 'true' : 'false');
    $('panel-simly').classList.toggle('is-active', isSim);
    $('panel-getfly').classList.toggle('is-active', !isSim);
    localStorage.setItem(LS_LAST_TAB, tab);
  }

  function bindTabs() {
    $('tab-simly').addEventListener('click', () => setActiveTab('simly'));
    $('tab-getfly').addEventListener('click', () => setActiveTab('getfly'));
    const last = localStorage.getItem(LS_LAST_TAB);
    setActiveTab(last === 'getfly' ? 'getfly' : 'simly');
  }

  function renderGetflyPresets(cfg) {
    const host = $('getflyPresetList');
    host.innerHTML = '';
    (cfg.getfly.presets || []).forEach((p) => {
      const wrap = document.createElement('div');
      wrap.className = 'crm-preset';
      wrap.setAttribute('data-preset-id', p.id);
      wrap.innerHTML = `
        <div class="crm-preset-top">
          <div class="crm-preset-left">
            <input type="checkbox" class="crm-preset-enabled" ${p.enabled ? 'checked' : ''} title="Enabled" />
            <input type="checkbox" class="crm-preset-selected" ${p.selected ? 'checked' : ''} title="Selected" />
            <div class="crm-preset-name" title="${escapeHtml(p.name || '')}">${escapeHtml(p.name || '')}</div>
          </div>
          <div class="crm-preset-controls">
            <button type="button" class="btn btn-ghost crm-btn crm-preset-run">Run</button>
            <button type="button" class="btn btn-ghost crm-btn crm-preset-curl">cURL</button>
            <button type="button" class="btn btn-ghost crm-btn crm-preset-dup">Dup</button>
            <button type="button" class="btn btn-ghost crm-btn crm-preset-del">Del</button>
          </div>
        </div>
        <div class="crm-preset-grid">
          <label class="crm-label">
            <span>Method</span>
            <select class="crm-input crm-preset-method">
              ${['GET','POST','PUT','PATCH','DELETE'].map((m) => `<option value="${m}" ${String(p.method||'GET').toUpperCase()===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </label>
          <label class="crm-label">
            <span>Path (relative)</span>
            <input class="crm-input crm-preset-path" value="${escapeHtml(p.path || '')}" placeholder="/api/..." />
          </label>
          <label class="crm-label">
            <span>Query JSON</span>
            <textarea class="crm-input crm-textarea crm-preset-query" placeholder='{"limit":10}'>${escapeHtml(p.query || '')}</textarea>
          </label>
          <label class="crm-label">
            <span>Headers JSON (merged with auth)</span>
            <textarea class="crm-input crm-textarea crm-preset-headers" placeholder='{"Content-Type":"application/json"}'>${escapeHtml(p.headers || '')}</textarea>
          </label>
          <label class="crm-label" style="grid-column: 1 / -1;">
            <span>Body (JSON or raw)</span>
            <textarea class="crm-input crm-textarea crm-preset-body" placeholder='{"name":"..." }'>${escapeHtml(p.body || '')}</textarea>
          </label>
        </div>
        <div class="crm-preset-response" hidden></div>
      `;

      // handlers
      const enabledEl = wrap.querySelector('.crm-preset-enabled');
      const selectedEl = wrap.querySelector('.crm-preset-selected');
      const methodEl = wrap.querySelector('.crm-preset-method');
      const pathEl = wrap.querySelector('.crm-preset-path');
      const queryEl = wrap.querySelector('.crm-preset-query');
      const headersEl = wrap.querySelector('.crm-preset-headers');
      const bodyEl = wrap.querySelector('.crm-preset-body');

      const update = () => {
        const target = cfg.getfly.presets.find((x) => x.id === p.id);
        if (!target) return;
        target.enabled = !!enabledEl.checked;
        target.selected = !!selectedEl.checked;
        target.method = String(methodEl.value || 'GET').toUpperCase();
        target.path = String(pathEl.value || '');
        target.query = String(queryEl.value || '');
        target.headers = String(headersEl.value || '');
        target.body = String(bodyEl.value || '');
        saveConfig(cfg);
      };

      [enabledEl, selectedEl, methodEl, pathEl, queryEl, headersEl, bodyEl].forEach((el) => {
        el.addEventListener('change', update);
        el.addEventListener('input', () => {
          // avoid spamming: only save on blur for textarea? keep simple but cheap.
        });
        el.addEventListener('blur', update);
      });

      wrap.querySelector('.crm-preset-run').addEventListener('click', async () => {
        await runGetflyPresets(cfg, { mode: 'single', ids: [p.id] });
      });
      wrap.querySelector('.crm-preset-curl').addEventListener('click', async () => {
        const method = String(methodEl.value || 'GET').toUpperCase();
        const queryObj = coerceQueryJson(queryEl.value || '');
        const url = buildUrl(cfg.getfly.baseUrl, String(pathEl.value || ''), queryObj, cfg);
        const authHeaders = buildGetflyAuthHeaders(cfg);
        const extraHeaders = coerceHeadersJson(headersEl.value || '');
        let headers = { ...authHeaders, ...extraHeaders };
        const { body, headers: finalHeaders } = buildBodyAndContentType(bodyEl.value || '', headers);
        headers = finalHeaders;
        const curl = buildCurlPreview({ method, url, headers, body });
        await copyText(curl);
        setPresetInlineResponse(p.id, { ok: true, status: 'cURL copied', method: 'COPY', url: '', ms: null, body: curl });
      });
      wrap.querySelector('.crm-preset-dup').addEventListener('click', () => {
        const copy = { ...p, id: uid(), name: `${p.name || 'Preset'} (copy)` };
        cfg.getfly.presets.unshift(copy);
        saveConfig(cfg);
        renderGetflyPresets(cfg);
      });
      wrap.querySelector('.crm-preset-del').addEventListener('click', () => {
        cfg.getfly.presets = cfg.getfly.presets.filter((x) => x.id !== p.id);
        saveConfig(cfg);
        renderGetflyPresets(cfg);
      });

      host.appendChild(wrap);
    });
  }

  function buildGetflyAuthHeaders(cfg) {
    const mode = cfg.getfly.authMode;
    if (mode === 'x-api-key') {
      const key = String(cfg.getfly.apiKey || '').trim();
      return key ? { 'X-API-KEY': key } : {};
    }
    if (mode === 'bearer') {
      const token = String(cfg.getfly.bearer || '').trim();
      if (!token) return {};
      const full = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      return { 'x-authorization': full };
    }
    if (mode === 'authorization') {
      const raw = String(cfg.getfly.authorizationRaw || '').trim();
      return raw ? { 'Authorization': raw } : {};
    }
    return {};
  }

  function buildUrl(baseUrl, path, queryObj, cfg) {
    const base = normalizeBaseUrl(baseUrl);
    const rel = String(path || '').trim();
    const full = rel.startsWith('http://') || rel.startsWith('https://') ? rel : `${base}${rel.startsWith('/') ? '' : '/'}${rel}`;
    const url = new URL(full);
    const qo = queryObj && typeof queryObj === 'object' ? queryObj : {};

    const setParam = (key, value) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        // Many APIs accept arrays as JSON string in query param (e.g. between/in)
        url.searchParams.set(key, JSON.stringify(value));
        return;
      }
      if (typeof value === 'object') {
        // Flatten nested objects into bracket notation: filtering[contact_name:contains]=Lê
        Object.keys(value).forEach((subKey) => {
          const subVal = value[subKey];
          const fullKey = `${key}[${subKey}]`;
          if (subVal === undefined || subVal === null) return;
          if (Array.isArray(subVal)) {
            url.searchParams.set(fullKey, JSON.stringify(subVal));
          } else if (typeof subVal === 'object') {
            url.searchParams.set(fullKey, JSON.stringify(subVal));
          } else {
            url.searchParams.set(fullKey, String(subVal));
          }
        });
        return;
      }
      url.searchParams.set(key, String(value));
    };

    Object.keys(qo).forEach((k) => setParam(k, qo[k]));
    const token = String(cfg.getfly.queryToken || '').trim();
    if (token && !url.searchParams.has('token')) url.searchParams.set('token', token);
    return url.toString();
  }

  function coerceHeadersJson(text) {
    const parsed = safeJsonParse(text, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    Object.keys(parsed).forEach((k) => {
      const v = parsed[k];
      if (v === undefined || v === null) return;
      out[String(k)] = String(v);
    });
    return out;
  }

  function coerceQueryJson(text) {
    const parsed = safeJsonParse(text, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  }

  function buildBodyAndContentType(bodyText, headers) {
    const raw = String(bodyText || '');
    const trimmed = raw.trim();
    if (!trimmed) return { body: undefined, headers };

    const asJson = safeJsonParse(trimmed, null);
    if (asJson !== null) {
      const nextHeaders = { ...headers };
      if (!Object.keys(nextHeaders).some((k) => k.toLowerCase() === 'content-type')) {
        nextHeaders['Content-Type'] = 'application/json';
      }
      return { body: JSON.stringify(asJson), headers: nextHeaders };
    }
    return { body: raw, headers };
  }

  function isDangerMethod(method) {
    const m = String(method || '').toUpperCase();
    return m !== 'GET';
  }

  async function runGetflyPresets(cfg, options) {
    const resHost = $('getflyResults');
    const allowDanger = $('getflyAllowDanger').checked;
    const mode = options?.mode || 'all'; // all | selected | single

    const list = (cfg.getfly.presets || []).filter((p) => p && p.enabled);
    const picked = list.filter((p) => {
      if (mode === 'selected') return !!p.selected;
      if (mode === 'single') return (options.ids || []).includes(p.id);
      return true;
    });

    for (const p of picked) {
      const method = String(p.method || 'GET').toUpperCase();
      const danger = isDangerMethod(method);
      const safeOnly = (options?.safeOnly === true);
      if (safeOnly && danger) continue;
      if (danger && !allowDanger) continue;

      const queryObj = coerceQueryJson(p.query || '');
      const url = buildUrl(cfg.getfly.baseUrl, p.path, queryObj, cfg);
      const authHeaders = buildGetflyAuthHeaders(cfg);
      const extraHeaders = coerceHeadersJson(p.headers || '');
      let headers = { ...authHeaders, ...extraHeaders };
      const { body, headers: finalHeaders } = buildBodyAndContentType(p.body || '', headers);
      headers = finalHeaders;

      const at = nowIso();
      try {
        clearPresetInlineResponse(p.id);
        const { res, text, ms } = await http(url, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : body
        });
        setPresetInlineResponse(p.id, {
          ok: res.ok,
          status: res.status,
          method,
          url,
          ms,
          body: prettyAny(text)
        });
        appendLog(resHost, {
          ok: res.ok,
          status: res.status,
          method,
          name: p.name,
          url,
          body: prettyAny(text),
          at
        });
        window.__crmLastGetflyResponse = text;
        window.__crmLastGetflyCurl = buildCurlPreview({ method, url, headers, body });
      } catch (e) {
        setPresetInlineResponse(p.id, {
          ok: false,
          status: 'ERR',
          method,
          url,
          ms: null,
          body: String(e && e.stack || e)
        });
        appendLog(resHost, {
          ok: false,
          status: 'ERR',
          method,
          name: p.name,
          url,
          body: String(e && e.stack || e),
          at
        });
      }
    }
  }

  async function simlyGetToken(cfg) {
    const base = normalizeBaseUrl(cfg.simly.baseUrl);
    const apiKey = String(cfg.simly.apiKey || '').trim();
    const url = `${base}/oauth/token`;
    const body = new URLSearchParams();
    body.set('grant_type', 'api_key');
    body.set('api_key', apiKey);

    const { res, text } = await http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const json = safeJsonParse(text, null);
    const token = json && json.access_token ? String(json.access_token) : '';
    return { ok: res.ok, status: res.status, text, token, url };
  }

  async function simlyPatient(cfg) {
    const base = normalizeBaseUrl(cfg.simly.baseUrl);
    const search = String(cfg.simly.patientSearch || '').trim();
    const page = String(cfg.simly.patientPage || '1').trim();
    const pageSize = String(cfg.simly.patientPageSize || '100').trim();
    const url = `${base}/api/v1/patient?search=${encodeURIComponent(search)}&page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`;

    let token = String(cfg.simly.accessToken || '').trim();
    if (!token) {
      const r = await simlyGetToken(cfg);
      if (r.token) token = r.token;
      if (r.token) {
        cfg.simly.accessToken = r.token;
        saveConfig(cfg);
        $('simAccessToken').value = r.token;
      }
    }
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const { res, text } = await http(url, { method: 'GET', headers });
    return { ok: res.ok, status: res.status, text, url };
  }

  function bindSimly(cfg) {
    $('simBaseUrl').value = cfg.simly.baseUrl || '';
    $('simApiKey').value = cfg.simly.apiKey || '';
    $('simAccessToken').value = cfg.simly.accessToken || '';
    $('simPatientSearch').value = cfg.simly.patientSearch || '';
    $('simPatientPage').value = cfg.simly.patientPage || '1';
    $('simPatientPageSize').value = cfg.simly.patientPageSize || '100';

    const resHost = $('simResults');

    $('btnSimSave').addEventListener('click', () => {
      cfg.simly.baseUrl = $('simBaseUrl').value;
      cfg.simly.apiKey = $('simApiKey').value;
      cfg.simly.accessToken = $('simAccessToken').value;
      cfg.simly.patientSearch = $('simPatientSearch').value;
      cfg.simly.patientPage = $('simPatientPage').value;
      cfg.simly.patientPageSize = $('simPatientPageSize').value;
      saveConfig(cfg);
    });

    $('btnSimGetToken').addEventListener('click', async () => {
      cfg.simly.baseUrl = $('simBaseUrl').value;
      cfg.simly.apiKey = $('simApiKey').value;
      saveConfig(cfg);
      const at = nowIso();
      try {
        const r = await simlyGetToken(cfg);
        if (r.token) {
          cfg.simly.accessToken = r.token;
          $('simAccessToken').value = r.token;
          saveConfig(cfg);
        }
        appendLog(resHost, {
          ok: r.ok,
          status: r.status,
          method: 'POST',
          name: 'Simlydent - /oauth/token',
          url: r.url,
          body: prettyAny(r.text),
          at
        });
        window.__crmLastSimlyResponse = r.text;
      } catch (e) {
        appendLog(resHost, {
          ok: false,
          status: 'ERR',
          method: 'POST',
          name: 'Simlydent - /oauth/token',
          url: '',
          body: String(e && e.stack || e),
          at
        });
      }
    });

    $('btnSimTestPatient').addEventListener('click', async () => {
      cfg.simly.baseUrl = $('simBaseUrl').value;
      cfg.simly.apiKey = $('simApiKey').value;
      cfg.simly.accessToken = $('simAccessToken').value;
      cfg.simly.patientSearch = $('simPatientSearch').value;
      cfg.simly.patientPage = $('simPatientPage').value;
      cfg.simly.patientPageSize = $('simPatientPageSize').value;
      saveConfig(cfg);
      const at = nowIso();
      try {
        const r = await simlyPatient(cfg);
        appendLog(resHost, {
          ok: r.ok,
          status: r.status,
          method: 'GET',
          name: 'Simlydent - /api/v1/patient',
          url: r.url,
          body: prettyAny(r.text),
          at
        });
        window.__crmLastSimlyResponse = r.text;
      } catch (e) {
        appendLog(resHost, {
          ok: false,
          status: 'ERR',
          method: 'GET',
          name: 'Simlydent - /api/v1/patient',
          url: '',
          body: String(e && e.stack || e),
          at
        });
      }
    });

    $('btnSimClear').addEventListener('click', () => {
      resHost.innerHTML = '';
    });
    $('btnSimCopyLast').addEventListener('click', async () => {
      const text = window.__crmLastSimlyResponse || '';
      await copyText(text);
    });
  }

  function bindGetfly(cfg) {
    $('getflyBaseUrl').value = cfg.getfly.baseUrl || '';
    $('getflyAuthMode').value = cfg.getfly.authMode || 'x-api-key';
    $('getflyApiKey').value = cfg.getfly.apiKey || '';
    $('getflyBearer').value = cfg.getfly.bearer || '';
    if ($('getflyAuthorizationRaw')) $('getflyAuthorizationRaw').value = cfg.getfly.authorizationRaw || '';
    $('getflyQueryToken').value = cfg.getfly.queryToken || '';

    renderGetflyPresets(cfg);

    $('btnGetflySave').addEventListener('click', () => {
      cfg.getfly.baseUrl = $('getflyBaseUrl').value;
      cfg.getfly.authMode = $('getflyAuthMode').value;
      cfg.getfly.apiKey = $('getflyApiKey').value;
      cfg.getfly.bearer = $('getflyBearer').value;
      if ($('getflyAuthorizationRaw')) cfg.getfly.authorizationRaw = $('getflyAuthorizationRaw').value;
      cfg.getfly.queryToken = $('getflyQueryToken').value;
      saveConfig(cfg);
    });

    $('btnGetflyResetPreset').addEventListener('click', () => {
      cfg.getfly.presets = buildDefaultGetflyPresets();
      saveConfig(cfg);
      renderGetflyPresets(cfg);
    });

    $('btnGetflyAddPreset').addEventListener('click', () => {
      const p = {
        id: uid(),
        enabled: true,
        selected: true,
        name: 'New preset',
        method: 'GET',
        path: '',
        query: '{\n  \n}',
        headers: '{\n  \n}',
        body: ''
      };
      cfg.getfly.presets.unshift(p);
      saveConfig(cfg);
      renderGetflyPresets(cfg);
    });

    const postmanFileInput = $('fileImportPostman');
    $('btnGetflyImportPostman').addEventListener('click', () => postmanFileInput.click());
    postmanFileInput.addEventListener('change', async () => {
      const file = postmanFileInput.files && postmanFileInput.files[0];
      if (!file) return;
      const text = await file.text();
      const json = safeJsonParse(text, null);
      if (!json || typeof json !== 'object') return;
      const items = Array.isArray(json.item) ? json.item : [];
      const flattened = [];
      const walk = (arr, prefix = '') => {
        (arr || []).forEach((it) => {
          if (it && Array.isArray(it.item)) return walk(it.item, prefix ? `${prefix} / ${it.name || ''}` : (it.name || ''));
          const req = it && it.request;
          if (!req) return;
          const method = String(req.method || 'GET').toUpperCase();
          let rawUrl = '';
          if (req.url && typeof req.url === 'object') rawUrl = req.url.raw || '';
          if (typeof req.url === 'string') rawUrl = req.url;
          const name = prefix ? `${prefix} / ${it.name || ''}` : (it.name || 'Postman request');
          const headersObj = {};
          (req.header || []).forEach((h) => {
            if (!h || !h.key) return;
            if (h.disabled) return;
            headersObj[h.key] = h.value ?? '';
          });
          let bodyText = '';
          if (req.body && typeof req.body === 'object') {
            if (req.body.mode === 'raw' && typeof req.body.raw === 'string') bodyText = req.body.raw;
            if (req.body.mode === 'urlencoded' && Array.isArray(req.body.urlencoded)) {
              const params = new URLSearchParams();
              req.body.urlencoded.forEach((u) => {
                if (!u || !u.key) return;
                if (u.disabled) return;
                params.set(u.key, u.value ?? '');
              });
              bodyText = params.toString();
              headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
            }
          }
          flattened.push({
            id: uid(),
            enabled: true,
            selected: true,
            name,
            method,
            path: rawUrl,
            query: '{\n  \n}',
            headers: JSON.stringify(headersObj, null, 2),
            body: bodyText
          });
        });
      };
      walk(items);
      if (flattened.length) {
        cfg.getfly.presets = [...flattened, ...(cfg.getfly.presets || [])];
        saveConfig(cfg);
        renderGetflyPresets(cfg);
      }
      postmanFileInput.value = '';
    });

    const resHost = $('getflyResults');
    $('btnGetflyRunAll').addEventListener('click', async () => {
      cfg.getfly.baseUrl = $('getflyBaseUrl').value;
      cfg.getfly.authMode = $('getflyAuthMode').value;
      cfg.getfly.apiKey = $('getflyApiKey').value;
      cfg.getfly.bearer = $('getflyBearer').value;
      if ($('getflyAuthorizationRaw')) cfg.getfly.authorizationRaw = $('getflyAuthorizationRaw').value;
      cfg.getfly.queryToken = $('getflyQueryToken').value;
      saveConfig(cfg);
      await runGetflyPresets(cfg, { mode: 'all', safeOnly: true });
    });
    $('btnGetflyRunSelected').addEventListener('click', async () => {
      cfg.getfly.baseUrl = $('getflyBaseUrl').value;
      cfg.getfly.authMode = $('getflyAuthMode').value;
      cfg.getfly.apiKey = $('getflyApiKey').value;
      cfg.getfly.bearer = $('getflyBearer').value;
      if ($('getflyAuthorizationRaw')) cfg.getfly.authorizationRaw = $('getflyAuthorizationRaw').value;
      cfg.getfly.queryToken = $('getflyQueryToken').value;
      saveConfig(cfg);
      await runGetflyPresets(cfg, { mode: 'selected', safeOnly: false });
    });
    $('btnGetflyClear').addEventListener('click', () => {
      resHost.innerHTML = '';
    });
    $('btnGetflyCopyLast').addEventListener('click', async () => {
      const text = window.__crmLastGetflyResponse || '';
      await copyText(text);
    });
  }

  function bindConfigImportExport(cfg) {
    $('btnExportConfig').addEventListener('click', () => {
      downloadJson(`crm-api-tester-config-${new Date().toISOString().slice(0,10)}.json`, cfg);
    });
    const fileInput = $('fileImportConfig');
    $('btnImportConfig').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const text = await file.text();
      const parsed = safeJsonParse(text, null);
      if (!parsed || typeof parsed !== 'object') return;
      const next = defaultConfig();
      next.simly = { ...next.simly, ...(parsed.simly || {}) };
      next.getfly = { ...next.getfly, ...(parsed.getfly || {}) };
      if (!Array.isArray(next.getfly.presets)) next.getfly.presets = buildDefaultGetflyPresets();
      Object.assign(cfg, next);
      saveConfig(cfg);
      // rebind UI by reload (simple + safe)
      window.location.reload();
    });
  }

  function boot() {
    const cfg = loadConfig();
    bindTabs();
    bindConfigImportExport(cfg);
    bindSimly(cfg);
    bindGetfly(cfg);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

