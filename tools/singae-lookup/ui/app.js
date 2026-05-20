const SINGAE_AUTH_KEY = "singae_auth";
const SINGAE_AUTOLOGIN_PREF_KEY = "singae_autologin_pref";

const loginViewEl = document.getElementById("lookup-login-view");
const loginFormEl = document.getElementById("lookup-login-form");
const loginUsernameEl = document.getElementById("lookup-login-username");
const loginPasswordEl = document.getElementById("lookup-login-password");
const loginAutoEl = document.getElementById("lookup-login-autologin");
const loginAutoWrapEl = loginAutoEl?.closest(".lookup-login-auto");
const loginSubmitEl = document.getElementById("lookup-login-submit");
const loginErrorEl = document.getElementById("lookup-login-error");
const loginLoadingEl = document.getElementById("lookup-login-loading");

const lookupFormEl = document.getElementById("lookup-form");
const lookupCodeEl = document.getElementById("lookup-account-code");
const lookupStatusEl = document.getElementById("lookup-status");
const lookupQuotaEl = document.getElementById("lookup-quota");
const lookupResultCardEl = document.getElementById("lookup-result-card");
const lookupResultCodeEl = document.getElementById("lookup-result-code");
const lookupResultNameEl = document.getElementById("lookup-result-name");
const lookupResultContactEl = document.getElementById("lookup-result-contact");
const lookupResultPhonesEl = document.getElementById("lookup-result-phones");
const lookupUserEl = document.getElementById("lookup-user");

let singaeAuth = null;
let lookupResultHideTimer = 0;

const WIN_SHELL_ME_API = "/api/windowsshell/auth/me";
async function bootstrapWithWindowsShellAuth() {
  // Tools no longer have their own login screens.
  // They reuse the main desktop session cookie from windowsshell.
  try {
    const res = await fetch(WIN_SHELL_ME_API, { credentials: "include" });
    if (!res.ok) throw new Error("NOT_AUTHENTICATED");
    const payload = await res.json().catch(() => ({}));
    const user = payload?.user || null;
    if (!user?.username) throw new Error("NOT_AUTHENTICATED");
    singaeAuth = {
      username: String(user.username || "").trim().toLowerCase(),
      token: "",
      role: String(user.role || "member").trim().toLowerCase(),
      autoLogin: false
    };
    try { setStoredAuth(null); } catch (_) {}
    try { setAutoLoginPref(false); } catch (_) {}
    try {
      if (loginViewEl) {
        loginViewEl.classList.remove("is-visible", "is-hiding");
        loginViewEl.setAttribute("aria-hidden", "true");
      }
    } catch (_) {}
    renderUserBadge();
    await loadQuota();
  } catch (_) {
    window.location.href = "/";
  }
}

function showStatus(message, ok = true) {
  if (!lookupStatusEl) return;
  lookupStatusEl.hidden = !message;
  lookupStatusEl.textContent = String(message || "");
  lookupStatusEl.className = `lookup-status ${ok ? "ok" : "error"}`;
}

function showLoginError(message) {
  if (!loginErrorEl) return;
  loginErrorEl.hidden = false;
  loginErrorEl.classList.remove("is-visible");
  void loginErrorEl.offsetWidth;
  loginErrorEl.classList.add("is-visible");
  loginErrorEl.textContent = String(message || "Đăng nhập thất bại.");
}

function setLoginLoading(loading, message = "Đang tải dữ liệu SINGAE Lookup...") {
  const active = Boolean(loading);
  if (loginLoadingEl) {
    loginLoadingEl.hidden = !active;
    if (active) loginLoadingEl.textContent = String(message || "Đang tải dữ liệu SINGAE Lookup...");
  }
  if (loginSubmitEl) loginSubmitEl.disabled = active;
}

function setAutoLoginChecked(enabled, persist = true) {
  const checked = Boolean(enabled);
  if (loginAutoEl) loginAutoEl.checked = checked;
  if (loginAutoWrapEl) loginAutoWrapEl.classList.toggle("is-checked", checked);
  if (persist) setAutoLoginPref(checked);
}

function getStoredAuth() {
  try {
    const raw = localStorage.getItem(SINGAE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = String(parsed?.username || "").trim().toLowerCase();
    const token = String(parsed?.token || "").trim();
    const role = String(parsed?.role || "user").trim().toLowerCase();
    const autoLogin = Boolean(parsed?.autoLogin);
    if (!username || !token) return null;
    return { username, token, role, autoLogin };
  } catch (_) {
    return null;
  }
}

function setStoredAuth(auth) {
  try {
    if (!auth) localStorage.removeItem(SINGAE_AUTH_KEY);
    else localStorage.setItem(SINGAE_AUTH_KEY, JSON.stringify(auth));
  } catch (_) {}
}

function getAutoLoginPref() {
  try {
    return String(localStorage.getItem(SINGAE_AUTOLOGIN_PREF_KEY) || "").trim().toLowerCase() === "true";
  } catch (_) {
    return false;
  }
}

function setAutoLoginPref(enabled) {
  try {
    localStorage.setItem(SINGAE_AUTOLOGIN_PREF_KEY, enabled ? "true" : "false");
  } catch (_) {}
}

async function verifySingaeAccount(username, password) {
  const response = await fetch("/api/singae-lookup/verify-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return {
    username: String(body?.username || username || "").trim().toLowerCase(),
    token: String(body?.token || "").trim(),
    role: String(body?.role || "user").trim().toLowerCase()
  };
}

function setLoginVisible(visible, options = {}) {
  if (!loginViewEl) return;
  const instant = Boolean(options.instant);
  if (visible) {
    loginViewEl.classList.remove("is-hiding");
    loginViewEl.classList.add("is-visible");
    loginViewEl.setAttribute("aria-hidden", "false");
    return;
  }
  if (instant) {
    loginViewEl.classList.remove("is-hiding");
    loginViewEl.classList.remove("is-visible");
    loginViewEl.setAttribute("aria-hidden", "true");
    return;
  }
  loginViewEl.classList.add("is-hiding");
  setTimeout(() => {
    loginViewEl.classList.remove("is-visible");
    loginViewEl.classList.remove("is-hiding");
    loginViewEl.setAttribute("aria-hidden", "true");
  }, 440);
}

function renderUserBadge() {
  if (!lookupUserEl) return;
  const username = String(singaeAuth?.username || "").trim().toLowerCase();
  if (!username) {
    lookupUserEl.hidden = true;
    lookupUserEl.textContent = "";
    return;
  }
  lookupUserEl.hidden = false;
  lookupUserEl.textContent = `@${username}`;
}

function renderQuota(quota) {
  if (!lookupQuotaEl) return;
  if (!quota) {
    lookupQuotaEl.hidden = true;
    lookupQuotaEl.textContent = "";
    return;
  }
  lookupQuotaEl.hidden = false;
  lookupQuotaEl.textContent = `Quota ${quota.used}/${quota.limit} - còn lại ${quota.remaining} (${quota.date})`;
}

function sanitizePhone(input) {
  return String(input || "")
    .trim()
    .replace(/[^\d+]/g, "");
}

function addPhoneFromValue(value, targetSet) {
  if (!targetSet) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => addPhoneFromValue(entry, targetSet));
    return;
  }
  if (!value) return;
  const cleaned = sanitizePhone(value);
  if (cleaned) targetSet.add(cleaned);
}

function collectPhonesDeep(node, targetSet, seen = new WeakSet()) {
  if (!node || !targetSet) return;
  if (typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);
  for (const [key, value] of Object.entries(node)) {
    if (typeof key === "string" && /phone|mobile|tel|zalo/i.test(key)) {
      addPhoneFromValue(value, targetSet);
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectPhonesDeep(entry, targetSet, seen));
    } else if (value && typeof value === "object") {
      collectPhonesDeep(value, targetSet, seen);
    }
  }
}

function pickBestAccount(responsePayload) {
  const root = responsePayload?.response || responsePayload || {};
  const list = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(root?.accounts)
      ? root.accounts
      : Array.isArray(root)
        ? root
        : [];
  if (list.length > 0 && list[0] && typeof list[0] === "object") return list[0];
  if (root && typeof root === "object") return root;
  return {};
}

function extractLookupSummary(responsePayload, fallbackCode = "") {
  const root = responsePayload?.response || responsePayload || {};
  const account = pickBestAccount(responsePayload);
  const accountCode = String(
    account?.account_code ||
      account?.code ||
      root?.account_code ||
      root?.accountCode ||
      fallbackCode ||
      ""
  ).trim();
  const accountName = String(
    account?.account_name ||
      account?.name ||
      account?.full_name ||
      account?.first_name ||
      root?.account_name ||
      root?.name ||
      ""
  ).trim();
  const contactName = String(
    account?.relation_name ||
      account?.contact_name ||
      root?.relation_name ||
      root?.contact_name ||
      ""
  ).trim();

  const phones = new Set();
  addPhoneFromValue(account?.phone_office, phones);
  if (Array.isArray(account?.contacts)) {
    account.contacts.forEach((contact) => {
      addPhoneFromValue(contact?.phone_home, phones);
      collectPhonesDeep(contact, phones);
    });
  }
  collectPhonesDeep(account, phones);
  collectPhonesDeep(root, phones);

  return {
    accountCode,
    accountName,
    contactName,
    phones: Array.from(phones)
  };
}

function hideLookupResult() {
  if (lookupResultCardEl) {
    lookupResultCardEl.classList.remove("is-visible");
    if (lookupResultHideTimer) clearTimeout(lookupResultHideTimer);
    lookupResultHideTimer = setTimeout(() => {
      lookupResultCardEl.hidden = true;
      lookupResultHideTimer = 0;
    }, 340);
  }
  if (lookupResultCodeEl) lookupResultCodeEl.textContent = "";
  if (lookupResultNameEl) lookupResultNameEl.textContent = "";
  if (lookupResultContactEl) lookupResultContactEl.textContent = "";
  if (lookupResultPhonesEl) lookupResultPhonesEl.innerHTML = "";
}

function renderLookupResult(summary) {
  if (!lookupResultCardEl) return;
  const code = String(summary?.accountCode || "-");
  const name = String(summary?.accountName || "-");
  const contact = String(summary?.contactName || "-");
  const phones = Array.isArray(summary?.phones) ? summary.phones : [];

  if (lookupResultCodeEl) lookupResultCodeEl.textContent = code;
  if (lookupResultNameEl) lookupResultNameEl.textContent = name;
  if (lookupResultContactEl) lookupResultContactEl.textContent = contact;
  if (lookupResultPhonesEl) {
    lookupResultPhonesEl.innerHTML = "";
    if (!phones.length) {
      const empty = document.createElement("span");
      empty.className = "lookup-phone-item muted";
      empty.textContent = "Không có số điện thoại";
      lookupResultPhonesEl.appendChild(empty);
    } else {
      phones.forEach((phone) => {
        const item = document.createElement("span");
        item.className = "lookup-phone-item";
        item.textContent = phone;
        lookupResultPhonesEl.appendChild(item);
      });
    }
  }
  if (lookupResultHideTimer) {
    clearTimeout(lookupResultHideTimer);
    lookupResultHideTimer = 0;
  }
  lookupResultCardEl.hidden = false;
  requestAnimationFrame(() => {
    lookupResultCardEl.classList.add("is-visible");
  });
}

async function loadQuota() {
  if (!singaeAuth?.username) return;
  try {
    const res = await fetch(`/api/singae-lookup/quota?username=${encodeURIComponent(singaeAuth.username)}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.quota) renderQuota(body.quota);
  } catch (_) {}
}

async function submitLookup(accountCode) {
  const response = await fetch("/api/singae-lookup/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: singaeAuth?.username || "",
      accountCode
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
  }
  return body;
}

function installLookupForm() {
  if (!lookupFormEl) return;
  hideLookupResult();
  lookupFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = String(lookupCodeEl?.value || "").trim().toUpperCase();
    if (!code) {
      showStatus("Vui lòng nhập mã KH.", false);
      return;
    }
    showStatus("Đang tra cứu...", true);
    try {
      const data = await submitLookup(code);
      renderQuota(data?.quota || null);
      const summary = extractLookupSummary(data, code);
      renderLookupResult(summary);
      showStatus(data?.cached ? "Tra cứu thành công (cache)." : "Tra cứu thành công.", true);
    } catch (error) {
      hideLookupResult();
      showStatus(error?.message || "Tra cứu thất bại.", false);
    }
  });
}

function installLoginFlow() {
  if (!loginFormEl) return;

  const stored = getStoredAuth();
  const preferredAutoLogin = getAutoLoginPref();
  setAutoLoginChecked(Boolean(preferredAutoLogin || stored?.autoLogin), false);
  loginAutoEl?.addEventListener("change", () => {
    setAutoLoginChecked(Boolean(loginAutoEl?.checked), true);
  });

  if (stored && (stored.autoLogin || preferredAutoLogin)) {
    singaeAuth = stored;
    setLoginVisible(false, { instant: true });
    renderUserBadge();
    loadQuota();
  } else {
    setLoginVisible(true);
  }

  loginFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loginErrorEl) {
      loginErrorEl.hidden = true;
      loginErrorEl.classList.remove("is-visible");
    }
    const username = String(loginUsernameEl?.value || "").trim().toLowerCase();
    const password = String(loginPasswordEl?.value || "");
    const autoLogin = Boolean(loginAutoEl?.checked);
    setAutoLoginChecked(autoLogin, true);

    if (!username || !password) {
      showLoginError("Vui lòng nhập username và password.");
      return;
    }

    setLoginLoading(true);
    try {
      const auth = await verifySingaeAccount(username, password);
      singaeAuth = auth;
      if (autoLogin) setStoredAuth({ ...auth, autoLogin: true });
      else setStoredAuth(null);
      setLoginVisible(false);
      renderUserBadge();
      await loadQuota();
      showStatus("Đăng nhập thành công.", true);
    } catch (error) {
      showLoginError(error?.message || "Đăng nhập thất bại.");
    } finally {
      setLoginLoading(false);
    }
  });
}

bootstrapWithWindowsShellAuth().finally(() => {
  installLookupForm();
});


