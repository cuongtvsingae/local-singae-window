"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { buildApiAuthUrl } from "@/lib/api";

type Resp = { status: "ok" | "error"; message?: string };

export default function ChangePasswordPage() {
  const [old_password, setOld] = useState("");
  const [new_password, setNew] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setOk(false);
    const res = await fetch(buildApiAuthUrl("/change-password"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_password, new_password }),
    });
    const j = (await res.json()) as Resp;
    if (!res.ok || j.status !== "ok") {
      setError(j.message || "Change password failed");
      return;
    }
    setOk(true);
  };

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <h2 className="header-title">Đổi mật khẩu</h2>
        {error ? <div className="card error">{error}</div> : null}
        {ok ? <div className="card">OK</div> : null}
        <form className="stack" onSubmit={onSubmit}>
          <input className="input" placeholder="old password" type="password" value={old_password} onChange={(e) => setOld(e.target.value)} />
          <input className="input" placeholder="new password (>=6)" type="password" value={new_password} onChange={(e) => setNew(e.target.value)} />
          <button className="button" type="submit">Update</button>
        </form>
      </div>
    </motion.div>
  );
}

