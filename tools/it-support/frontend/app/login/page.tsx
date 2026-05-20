"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Đăng nhập dùng chung WindowShell — không còn form login riêng.
 */
export default function LoginPage() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <h2 className="header-title">Đăng nhập</h2>
        <p className="muted">Đang chuyển về trang chủ để đăng nhập (session dùng chung)…</p>
        <a className="button" href="/">Mở trang chủ</a>
      </div>
    </motion.div>
  );
}
