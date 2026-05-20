"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { buildApiAuthUrl } from "@/lib/api";

type MeResp = {
  status: "ok" | "error";
  data?: {
    id: number;
    username: string;
    role: "employee" | "admin";
    full_name?: string | null;
    company_level?: string | null;
    department?: string | null;
    work_schedule?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
};

export default function MePage() {
  const [me, setMe] = useState<MeResp["data"] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      let token = "";
      try {
        token = localStorage.getItem("it_support_token") || "";
      } catch {
        token = "";
      }
      if (!token) {
        setMe(null);
        return;
      }
      const res = await fetch(buildApiAuthUrl("/me"), { headers: { Authorization: `Bearer ${token}` } });
      const j = (await res.json()) as MeResp;
      if (!res.ok || j.status !== "ok") {
        setError("Không lấy được thông tin user.");
        setMe(null);
        return;
      }
      setMe(j.data || null);
    })();
  }, []);

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="header-title">Thông tin cá nhân</h2>
            <div className="muted">Hiển thị đầy đủ thông tin tài khoản (trống cũng hiển thị).</div>
          </div>
          <a className="button secondary" href="/">Quay lại</a>
        </div>
        {error ? <div className="card error">{error}</div> : null}
        {me ? (
          <div className="stack">
            <div><b>ID:</b> {me.id}</div>
            <div><b>Username:</b> {me.username}</div>
            <div><b>Role:</b> {me.role}</div>
            <div><b>Họ tên:</b> {me.full_name || ""}</div>
            <div><b>Level trong công ty:</b> {me.company_level || ""}</div>
            <div><b>Phòng ban:</b> {me.department || ""}</div>
            <div><b>Lịch làm việc:</b> <span style={{ whiteSpace: "pre-wrap" }}>{me.work_schedule || ""}</span></div>
            <div><b>Ngày tạo:</b> {me.created_at || ""}</div>
            <div><b>Cập nhật:</b> {me.updated_at || ""}</div>
            {me.role === "admin" ? <a className="button secondary" href="/admin/dashboard">Mở trang Admin</a> : null}
            <a className="button secondary" href="/change-password">Đổi mật khẩu</a>
          </div>
        ) : (
          <div className="muted">Chưa đăng nhập.</div>
        )}
      </div>
    </motion.div>
  );
}

