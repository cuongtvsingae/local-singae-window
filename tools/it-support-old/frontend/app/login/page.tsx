"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { buildApiAuthUrl } from "@/lib/api";

type LoginResp = { status: "ok" | "error"; data?: { token: string; user: { id: number; username: string; role: string } }; message?: string };

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setOk(false);
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
    setOk(true);
    window.location.href = "/";
  };

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <h2 className="header-title">Đăng nhập</h2>
        {error ? <div className="card error">{error}</div> : null}
        {ok ? <div className="card">OK</div> : null}
        <form className="stack" onSubmit={onSubmit}>
          <input className="input" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="button" type="submit">Login</button>
          <a className="muted" href="/register">Chưa có tài khoản? Đăng ký</a>
        </form>
      </div>
    </motion.div>
  );
}

