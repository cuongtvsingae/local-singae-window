"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildApiAuthUrl } from "@/lib/api";

type MeResp = { status: "ok" | "error"; data?: { id: number; username: string; role: "employee" | "admin" } };
type LoginResp = { status: "ok" | "error"; data?: { token: string; user: { id: number; username: string; role: string } }; message?: string };

function getToken() {
  try {
    return localStorage.getItem("it_support_token") || "";
  } catch {
    return "";
  }
}

export default function AuthGate() {
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<MeResp["data"] | null>(null);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState("");
  useEffect(() => {
    // Clear legacy/old cache keys if any existed in previous versions.
    try {
      const CACHE_VERSION_KEY = "it_support_cache_version";
      const CURRENT_CACHE_VERSION = "2";
      const prev = localStorage.getItem(CACHE_VERSION_KEY) || "";

      localStorage.removeItem("tdog_token");
      localStorage.removeItem("tdog-assistant-token");
      localStorage.removeItem("it_support_user");

      // If cache format changed, clear any old/unknown app cache keys (keep token).
      if (prev !== CURRENT_CACHE_VERSION) {
        // Known legacy keys (safe to remove if present)
        localStorage.removeItem("it_support_chat");
        localStorage.removeItem("it_support_chat_history");
        localStorage.removeItem("it_support_tasks");
        localStorage.removeItem("it_support_task_cache");
        localStorage.removeItem("it_support_dashboard_cache");
        localStorage.removeItem("it_support_me_cache");
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
      }
    } catch {
      // ignore
    }
    setToken(getToken());
  }, []);

  const loadMe = async () => {
    setError("");
    const t = getToken();
    if (!t) {
      setMe(null);
      setChecking(false);
      return;
    }
    try {
      const res = await fetch(buildApiAuthUrl("/me"), { headers: { Authorization: `Bearer ${t}` } });
      const j = (await res.json()) as MeResp;
      if (!res.ok || j.status !== "ok") {
        // token invalid -> clear
        try { localStorage.removeItem("it_support_token"); } catch {}
        setToken("");
        setMe(null);
      } else {
        setMe(j.data || null);
      }
    } catch {
      try { localStorage.removeItem("it_support_token"); } catch {}
      setToken("");
      setMe(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    try {
      localStorage.removeItem("it_support_token");
    } catch {
      // ignore
    }
    setMe(null);
    setChecking(false);
    setToken("");
  };

  const doLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch(buildApiAuthUrl("/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const j = (await res.json()) as LoginResp;
    if (!res.ok || j.status !== "ok" || !j.data?.token) {
      setError(j.message || "Login failed");
      return;
    }
    localStorage.setItem("it_support_token", j.data.token);
    setToken(j.data.token);
    setUsername("");
    setPassword("");
    setChecking(true);
    await loadMe();
  };

  const isLoggedIn = !!me;
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const normalizedPath = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const allowAnonymous = normalizedPath === "/register";

  return (
    <>
      {isLoggedIn ? (
        <div style={{ position: "fixed", top: 14, right: 16, zIndex: 90, display: "flex", gap: 10 }}>
          <a className="button secondary" href="/me">Cá nhân</a>
          {me?.role === "admin" ? <a className="button secondary" href="/admin/dashboard">Admin</a> : null}
          <button className="button secondary" type="button" onClick={logout}>Đăng xuất</button>
        </div>
      ) : null}

      <AnimatePresence>
        {!allowAnonymous && !isLoggedIn && !checking ? (
          <motion.div
            className="auth-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="card auth-panel stack"
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 18 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <div>
                <div className="header-title">PHÒNG IT - SINGAE</div>
                <div className="muted">Bạn cần đăng nhập để sử dụng hệ thống.</div>
              </div>

              {error ? <div className="card error">{error}</div> : null}

              <form className="stack" onSubmit={doLogin}>
                <input className="input" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                <input className="input" placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="button" type="submit">Đăng nhập</button>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <a className="muted" href="/register">Tạo tài khoản</a>
                </div>
              </form>

              {token ? (
                <button className="button secondary" type="button" onClick={logout}>
                  Xóa token / Đăng xuất
                </button>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

