"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { buildApiAdminUrl } from "@/lib/api";

type UserRow = {
  id: number;
  username: string;
  role: "employee" | "admin";
  full_name: string | null;
  company_level: string | null;
  department?: string | null;
  work_schedule: string | null;
  created_at?: string;
  updated_at?: string;
};

type ApiResp<T> = { status: "ok" | "error"; data?: T; message?: string };

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const token = useMemo(() => {
    try {
      return localStorage.getItem("it_support_token") || "";
    } catch {
      return "";
    }
  }, []);

  const load = async () => {
    setError("");
    const res = await fetch(buildApiAdminUrl("/users"), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const j = (await res.json()) as ApiResp<UserRow[]>;
    if (!res.ok || j.status !== "ok") {
      setError(j.message || "Cannot load users (need admin)");
      return;
    }
    setRows(j.data || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRow = async (e: FormEvent, row: UserRow) => {
    e.preventDefault();
    setSaving(row.id);
    setError("");
    const payload = {
      full_name: row.full_name || "",
      company_level: row.company_level || "",
      department: row.department || "",
      work_schedule: row.work_schedule || "",
      role: row.role,
    };
    const res = await fetch(buildApiAdminUrl(`/users/${row.id}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const j = (await res.json()) as ApiResp<{ id: number }>;
    if (!res.ok || j.status !== "ok") {
      setError(j.message || "Save failed");
    } else {
      await load();
    }
    setSaving(null);
  };

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="header-title">Admin: Quản lý user</h2>
            <div className="muted">Sửa thông tin nếu đăng ký thiếu/sai. Role chỉ có employee/admin.</div>
          </div>
          <a className="button secondary" href="/">Quay lại</a>
        </div>
        {error ? <div className="card error">{error}</div> : null}
      </div>

      {rows.map((r) => (
        <form key={r.id} className="card stack" onSubmit={(e) => saveRow(e, r)}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <b>{r.username}</b> <span className="muted">#{r.id}</span>
            </div>
            <button className="button icon-btn" type="submit" disabled={saving === r.id}>
              Lưu
            </button>
          </div>
          <div className="row">
            <select
              className="select"
              value={r.role}
              onChange={(e) =>
                setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, role: e.target.value as UserRow["role"] } : x)))
              }
            >
              <option value="employee">employee</option>
              <option value="admin">admin</option>
            </select>
            <input
              className="input"
              placeholder="Họ tên"
              value={r.full_name || ""}
              onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, full_name: e.target.value } : x)))}
            />
          </div>
          <input
            className="input"
            placeholder="Level trong công ty"
            value={r.company_level || ""}
            onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, company_level: e.target.value } : x)))}
          />
          <input
            className="input"
            placeholder="Phòng ban"
            value={(r.department as string) || ""}
            onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, department: e.target.value } : x)))}
          />
          <textarea
            className="textarea"
            placeholder="Lịch làm việc (text/JSON)"
            value={r.work_schedule || ""}
            onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, work_schedule: e.target.value } : x)))}
          />
        </form>
      ))}
    </motion.div>
  );
}

