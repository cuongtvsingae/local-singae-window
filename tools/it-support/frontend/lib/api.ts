const API_ROOT = process.env.NEXT_PUBLIC_API_ROOT || "";
/** Hub: main server proxies /api/it-support/* → child IT Support */
const API_V1_BASE = process.env.NEXT_PUBLIC_API_V1_BASE || `${API_ROOT}/api/it-support/api/v1`;
const API_AUTH_BASE = process.env.NEXT_PUBLIC_API_AUTH_BASE || `${API_ROOT}/api/it-support/api/auth`;
const API_ADMIN_BASE = process.env.NEXT_PUBLIC_API_ADMIN_BASE || `${API_ROOT}/api/it-support/api/admin`;
const SHELL_AUTH_BASE = process.env.NEXT_PUBLIC_SHELL_AUTH_BASE || `${API_ROOT}/api/windowsshell/auth`;

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
export const buildShellAuthUrl = (path: string) => joinUrl(SHELL_AUTH_BASE, path);

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(buildApiV1Url(path), {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildApiV1Url(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildApiV1Url(path), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(buildApiV1Url(path), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

