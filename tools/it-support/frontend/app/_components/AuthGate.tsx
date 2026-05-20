"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildApiAuthUrl, buildShellAuthUrl } from "@/lib/api";

type MeResp = { status: "ok" | "error"; data?: { id: number; username: string; role: "employee" | "admin" } };

export default function AuthGate() {
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<MeResp["data"] | null>(null);
  const [error, setError] = useState("");

  const loadMe = async () => {
    setError("");
    try {
      const shell = await fetch(buildShellAuthUrl("/me"), { credentials: "include", cache: "no-store" });
      if (!shell.ok) {
        setMe(null);
        setChecking(false);
        return;
      }
      const res = await fetch(buildApiAuthUrl("/me"), { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as MeResp;
      if (!res.ok || j.status !== "ok") {
        setMe(null);
      } else {
        setMe(j.data || null);
      }
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    try {
      const CACHE_VERSION_KEY = "it_support_cache_version";
      const CURRENT_CACHE_VERSION = "3";
      const prev = localStorage.getItem(CACHE_VERSION_KEY) || "";
      localStorage.removeItem("tdog_token");
      localStorage.removeItem("tdog-assistant-token");
      localStorage.removeItem("it_support_user");
      localStorage.removeItem("it_support_token");
      if (prev !== CURRENT_CACHE_VERSION) {
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
    void loadMe();
  }, []);

  const logout = async () => {
    try {
      await fetch(buildShellAuthUrl("/logout"), { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    setMe(null);
    setChecking(false);
  };

  const goLogin = () => {
    window.location.href = "/";
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
          <button className="button secondary" type="button" onClick={() => void logout()}>Đăng xuất</button>
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
                <div className="muted">Đăng nhập một lần trên ứng dụng (WindowShell). Session dùng chung toàn bộ tool.</div>
              </div>

              {error ? <div className="card error">{error}</div> : null}

              <div className="stack">
                <button className="button" type="button" onClick={goLogin}>
                  Đi tới trang đăng nhập
                </button>
                <div className="muted" style={{ fontSize: 13 }}>
                  Sau khi đăng nhập, quay lại trang IT Support. Nếu vẫn thấy thông báo này, tải lại trang (F5).
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
