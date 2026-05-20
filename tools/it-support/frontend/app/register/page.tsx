"use client";

import { motion } from "framer-motion";

export default function RegisterPage() {
  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <h2 className="header-title">Đăng ký</h2>
        <p className="muted">
          Tài khoản được quản lý tập trung. Tạo user qua <strong>User Admin</strong> (WindowShell) hoặc đồng bộ từ hệ thống nhân sự — không đăng ký trực tiếp tại IT Support.
        </p>
        <a className="button" href="/users">Mở User Admin</a>
        <a className="button secondary" href="/">Về trang chủ</a>
      </div>
    </motion.div>
  );
}
