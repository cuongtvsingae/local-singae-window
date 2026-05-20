const API_ROOT = process.env.NEXT_PUBLIC_API_ROOT || "";
const API_V1_BASE = process.env.NEXT_PUBLIC_API_V1_BASE || `${API_ROOT}/api/v1`;
const API_AUTH_BASE = process.env.NEXT_PUBLIC_API_AUTH_BASE || `${API_ROOT}/api/auth`;
const API_ADMIN_BASE = process.env.NEXT_PUBLIC_API_ADMIN_BASE || `${API_ROOT}/api/admin`;

function joinUrl(base: string, path: string): string {
  const rawBase = (base || "").trim();
  let normalizedBase = rawBase.replace(/\/+$/, "");
  if (normalizedBase && !/^https?:\/\//i.test(normalizedBase) && !normalizedBase.startsWith("/")) {
    // Avoid relative URL like "api/auth/register" from env misconfiguration.
    normalizedBase = `/${normalizedBase}`;
  }
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${safePath}`;
}

export const API_BASE = API_V1_BASE;
export const buildApiV1Url = (path: string) => joinUrl(API_V1_BASE, path);
export const buildApiAuthUrl = (path: string) => joinUrl(API_AUTH_BASE, path);
export const buildApiAdminUrl = (path: string) => joinUrl(API_ADMIN_BASE, path);

function getToken() {
  try {
    return localStorage.getItem("it_support_token") || "";
  } catch {
    return "";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(buildApiV1Url(path), {
    credentials: "include",
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(buildApiV1Url(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(buildApiV1Url(path), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(buildApiV1Url(path), {
    method: "DELETE",
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

