"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { buildApiAuthUrl } from "@/lib/api";

type RegisterResp = { status: "ok" | "error"; data?: { id: number; username: string; role: string }; message?: string };

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    password: "",
    password2: "",
    full_name: "",
    company_level: "",
    department: "",
    work_schedule: "",
  });
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setOk(false);
    if (form.password !== form.password2) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setBusy(true);
    const res = await fetch(buildApiAuthUrl("/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        company_level: form.company_level,
        department: form.department,
        work_schedule: form.work_schedule,
      }),
    });
    const j = (await res.json()) as RegisterResp;
    if (!res.ok || j.status !== "ok") {
      setError(j.message || "Register failed");
      setBusy(false);
      return;
    }
    setOk(true);
    window.location.href = "/login";
  };

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <motion.div className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="header-title">Tạo tài khoản</h2>
            <div className="muted">Nhập đầy đủ thông tin để tạo tài khoản nhân viên.</div>
          </div>
          <a className="button secondary" href="/login">Login</a>
        </div>

        {error ? (
          <motion.div className="card error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.div>
        ) : null}
        {ok ? <div className="card">OK</div> : null}

        <form className="stack" onSubmit={onSubmit}>
          <div className="card stack" style={{ padding: 12 }}>
            <h3 className="form-section-title">Tài khoản</h3>
            <div className="form-grid-2">
              <input required className="input" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <div className="helper">Username dùng để đăng nhập (không dấu, không khoảng trắng).</div>
              <input required className="input" placeholder="Mật khẩu (>=6)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <input required className="input" placeholder="Nhập lại mật khẩu" type="password" value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })} />
            </div>
          </div>

          <div className="card stack" style={{ padding: 12 }}>
            <h3 className="form-section-title">Thông tin nhân sự</h3>
            <div className="form-grid-2">
              <input required className="input" placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <input required className="input" placeholder="Level trong công ty" value={form.company_level} onChange={(e) => setForm({ ...form, company_level: e.target.value })} />
              <select required className="select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                <option value="" disabled>Chọn phòng ban</option>
                <option>Hành chính - Nhân sự</option>
                <option>Kế toán</option>
                <option>Marketing</option>
                <option>Giám sát</option>
                <option>Telesale</option>
                <option>Chăm sóc khách hàng</option>
                <option>Kinh doanh</option>
              </select>
              <div className="helper">Chọn đúng phòng ban để phân quyền và workflow sau này.</div>
            </div>
          </div>

          <div className="card stack" style={{ padding: 12 }}>
            <h3 className="form-section-title">Lịch làm việc (tuỳ chọn)</h3>
            <div className="helper">Bạn có thể nhập sau. Admin cũng có thể chỉnh sửa trong trang quản trị.</div>
            <textarea className="textarea" placeholder="Ví dụ: 08h30-17h30, nghỉ trưa 12h-13h ..." value={form.work_schedule} onChange={(e) => setForm({ ...form, work_schedule: e.target.value })} />
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <a className="button secondary" href="/">Back</a>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Đang tạo..." : "Tạo tài khoản"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

