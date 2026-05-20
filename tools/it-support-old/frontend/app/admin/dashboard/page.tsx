"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildApiAdminUrl } from "@/lib/api";

type ApiResp<T> = { status: "ok" | "error"; data?: T; message?: string };
type UserRow = { id: number; username: string; role: "employee" | "admin"; full_name?: string | null };
type ChatMsg = { id: number; user_id: number; role: string; text: string; created_at: string };
type HttpLogRow = { id: number; method: string; path: string; status: number; duration_ms: number; ip: string; user_id: number | null; created_at: string };
type ZaloApiDef = {
  id: string;
  name: string;
  method: string;
  path: string;
  requiredPathParams: string[];
  defaultQuery: Record<string, unknown>;
};

const tabs = [
  { key: "user", label: "Thông tin user" },
  { key: "chat", label: "Lịch sử chat" },
  { key: "db", label: "Database" },
  { key: "zalo", label: "Zalo API Test" },
  { key: "logs", label: "Log server" },
] as const;

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("user");
  const [error, setError] = useState("");

  const [token, setToken] = useState("");
  useEffect(() => {
    try {
      setToken(localStorage.getItem("it_support_token") || "");
    } catch {
      setToken("");
    }
  }, []);

  // Users list (for chat + db)
  const [users, setUsers] = useState<UserRow[]>([]);

  // Chat
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);

  // DB
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [rowEditId, setRowEditId] = useState<number | null>(null);
  const [rowEditJson, setRowEditJson] = useState<string>("");

  // Logs
  const [logs, setLogs] = useState<HttpLogRow[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [logDetail, setLogDetail] = useState<any | null>(null);

  // Zalo API test
  const [zaloApis, setZaloApis] = useState<ZaloApiDef[]>([]);
  const [selectedZaloApiId, setSelectedZaloApiId] = useState<string>("");
  const [zaloClientId, setZaloClientId] = useState("");
  const [zaloToken, setZaloToken] = useState("");
  const [zaloPathParamsText, setZaloPathParamsText] = useState("{\n  \"conversationId\": \"\"\n}");
  const [zaloQueryText, setZaloQueryText] = useState("{\n  \"limit\": 20\n}");
  const [zaloBusy, setZaloBusy] = useState(false);
  const [zaloResult, setZaloResult] = useState<any | null>(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const loadUsers = async () => {
    setError("");
    const res = await fetch(buildApiAdminUrl("/users"), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<UserRow[]>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load users");
    setUsers(j.data || []);
    if (!selectedUserId && (j.data || []).length > 0) setSelectedUserId((j.data || [])[0].id);
  };

  const loadTables = async () => {
    const res = await fetch(buildApiAdminUrl("/db/tables"), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<string[]>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load tables");
    setTables(j.data || []);
    if (!table && (j.data || []).length > 0) setTable((j.data || [])[0]);
  };

  const loadChat = async (uid: number) => {
    const res = await fetch(buildApiAdminUrl(`/chat/${uid}`), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<ChatMsg[]>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load chat");
    setChat(j.data || []);
  };

  const loadTableRows = async (t: string) => {
    const res = await fetch(buildApiAdminUrl(`/db/table/${encodeURIComponent(t)}?limit=50&offset=0`), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<any[]>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load rows");
    setRows(j.data || []);
  };

  const loadLogs = async () => {
    const res = await fetch(buildApiAdminUrl("/logs"), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<HttpLogRow[]>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load logs");
    setLogs(j.data || []);
    if (!selectedLogId && (j.data || []).length > 0) setSelectedLogId((j.data || [])[0].id);
  };

  const loadLogDetail = async (id: number) => {
    const res = await fetch(buildApiAdminUrl(`/logs/${id}`), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<any>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load log detail");
    setLogDetail(j.data || null);
  };

  const loadZaloApis = async () => {
    const res = await fetch(buildApiAdminUrl("/zalo/apis"), { headers: authHeaders });
    const j = (await res.json()) as ApiResp<ZaloApiDef[]>;
    if (!res.ok || j.status !== "ok") throw new Error(j.message || "Cannot load Zalo APIs");
    const items = j.data || [];
    setZaloApis(items);
    if (!selectedZaloApiId && items.length > 0) {
      const first = items[0];
      setSelectedZaloApiId(first.id);
      setZaloQueryText(JSON.stringify(first.defaultQuery || {}, null, 2));
      const initialPathParams: Record<string, string> = {};
      for (const p of first.requiredPathParams || []) initialPathParams[p] = "";
      setZaloPathParamsText(JSON.stringify(initialPathParams, null, 2));
    }
  };

  const runZaloTest = async () => {
    if (!selectedZaloApiId) return;
    setZaloBusy(true);
    setError("");
    setZaloResult(null);
    try {
      let queryObj: Record<string, unknown> = {};
      let pathParamsObj: Record<string, unknown> = {};
      try {
        queryObj = zaloQueryText.trim() ? JSON.parse(zaloQueryText) : {};
      } catch {
        setError("JSON Query không hợp lệ.");
        return;
      }
      try {
        pathParamsObj = zaloPathParamsText.trim() ? JSON.parse(zaloPathParamsText) : {};
      } catch {
        setError("JSON Path Params không hợp lệ.");
        return;
      }
      const res = await fetch(buildApiAdminUrl("/zalo/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders || {}) },
        body: JSON.stringify({
          apiId: selectedZaloApiId,
          query: queryObj,
          pathParams: pathParamsObj,
          clientId: zaloClientId,
          token: zaloToken,
        }),
      });
      const j = (await res.json()) as ApiResp<any>;
      if (!res.ok || j.status !== "ok") {
        setError(j.message || "Zalo test failed");
        return;
      }
      setZaloResult(j.data || null);
    } finally {
      setZaloBusy(false);
    }
  };

  const pretty = (x: any) => {
    try {
      if (typeof x === "string") {
        const parsed = JSON.parse(x);
        return JSON.stringify(parsed, null, 2);
      }
      return JSON.stringify(x, null, 2);
    } catch {
      return String(x ?? "");
    }
  };

  useEffect(() => {
    if (!token) return; // wait until token is loaded from localStorage
    (async () => {
      try {
        await loadUsers();
        await loadTables();
      } catch (e: any) {
        setError(e.message || "Admin load failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (tab === "chat" && selectedUserId) {
      loadChat(selectedUserId).catch((e) => setError((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedUserId]);

  useEffect(() => {
    if (tab === "db" && table) {
      loadTableRows(table).catch((e) => setError((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, table]);

  useEffect(() => {
    if (tab === "logs") {
      loadLogs().catch((e) => setError((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "zalo") {
      loadZaloApis().catch((e) => setError((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "logs" && selectedLogId) {
      loadLogDetail(selectedLogId).catch((e) => setError((e as Error).message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedLogId]);

  const startEditRow = (r: any) => {
    setRowEditId(Number(r.id));
    setRowEditJson(JSON.stringify(r, null, 2));
  };

  const saveRow = async () => {
    if (!table || !rowEditId) return;
    let parsed: any;
    try {
      parsed = JSON.parse(rowEditJson);
    } catch {
      setError("JSON không hợp lệ.");
      return;
    }
    const patch: any = { ...parsed };
    delete patch.id;
    const res = await fetch(buildApiAdminUrl(`/db/table/${encodeURIComponent(table)}/${rowEditId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(authHeaders || {}) },
      body: JSON.stringify({ patch }),
    });
    const j = (await res.json()) as ApiResp<any>;
    if (!res.ok || j.status !== "ok") {
      setError(j.message || "Update failed");
      return;
    }
    await loadTableRows(table);
    setRowEditId(null);
    setRowEditJson("");
  };

  const deleteRow = async (id: number) => {
    if (!table) return;
    const res = await fetch(buildApiAdminUrl(`/db/table/${encodeURIComponent(table)}/${id}`), {
      method: "DELETE",
      headers: authHeaders,
    });
    const j = (await res.json()) as ApiResp<any>;
    if (!res.ok || j.status !== "ok") {
      setError(j.message || "Delete failed");
      return;
    }
    await loadTableRows(table);
  };

  return (
    <motion.div className="container stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="header-title">Admin Dashboard</h2>
            <div className="muted">Tabs: user / chat / database (read + edit + delete).</div>
          </div>
          <a className="button secondary" href="/">Back</a>
        </div>
        <div className="row">
          {tabs.map((t) => (
            <motion.button
              key={t.key}
              className={`tag-button ${tab === t.key ? "active" : ""}`}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
            </motion.button>
          ))}
        </div>
        {error ? <div className="card error">{error}</div> : null}
      </div>

      <AnimatePresence mode="wait">
        {tab === "user" ? (
          <motion.div key="user" className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <h3 className="section-title">User list</h3>
            <div className="muted">Quản lý chi tiết ở trang `/admin/users`.</div>
            <div className="stack">
              {users.map((u) => (
                <div key={u.id} className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <b>{u.username}</b> <span className="muted">#{u.id}</span>
                  </div>
                  <span className="muted">{u.role}</span>
                </div>
              ))}
            </div>
            <a className="button secondary" href="/admin/users">Open User Manager</a>
          </motion.div>
        ) : null}

        {tab === "chat" ? (
          <motion.div key="chat" className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 className="section-title">Chat history</h3>
              <select className="select" value={selectedUserId || ""} onChange={(e) => setSelectedUserId(Number(e.target.value))}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} #{u.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="assistant-body" style={{ maxHeight: 420 }}>
              {chat.map((m) => (
                <div key={m.id} className={`assistant-bubble ${m.role === "user" ? "user" : "assistant"}`}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{m.created_at}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}

        {tab === "db" ? (
          <motion.div key="db" className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 className="section-title">Database browser</h3>
              <select className="select" value={table} onChange={(e) => setTable(e.target.value)}>
                {tables.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="muted">Chọn table → xem 50 row mới nhất. Edit/Delete áp dụng cho: users/tasks/attendance_daily/chat_messages.</div>

            <div className="stack">
              {rows.map((r) => (
                <div key={r.id ?? JSON.stringify(r)} className="card stack" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="muted">id: <b>{String(r.id ?? "(no id)")}</b></div>
                    <div className="row">
                      {r.id ? (
                        <>
                          <button className="button secondary" type="button" onClick={() => startEditRow(r)}>Edit</button>
                          <button className="button secondary" type="button" onClick={() => deleteRow(Number(r.id))}>Delete</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(r, null, 2)}</pre>
                </div>
              ))}
            </div>

            <AnimatePresence>
              {rowEditId ? (
                <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRowEditId(null)}>
                  <motion.div className="modal-panel card stack" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 className="section-title">Edit row #{rowEditId}</h3>
                      <button className="button secondary" type="button" onClick={() => setRowEditId(null)}>Close</button>
                    </div>
                    <textarea className="textarea" value={rowEditJson} onChange={(e) => setRowEditJson(e.target.value)} />
                    <div className="row">
                      <button className="button" type="button" onClick={saveRow}>Save</button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}

        {tab === "zalo" ? (
          <motion.div key="zalo" className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 className="section-title">Zalo Open API Test</h3>
              <button className="button secondary" type="button" onClick={() => loadZaloApis().catch((e) => setError((e as Error).message))}>
                Tải lại API list
              </button>
            </div>
            <div className="muted">Nguồn API từ tài liệu `SwZaloOpenAPI (1).docx`. Header bắt buộc: client-id + token.</div>

            <select
              className="select"
              value={selectedZaloApiId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedZaloApiId(nextId);
                const picked = zaloApis.find((x) => x.id === nextId);
                if (picked) {
                  setZaloQueryText(JSON.stringify(picked.defaultQuery || {}, null, 2));
                  const pp: Record<string, string> = {};
                  for (const p of picked.requiredPathParams || []) pp[p] = "";
                  setZaloPathParamsText(JSON.stringify(pp, null, 2));
                }
              }}
            >
              {zaloApis.map((x) => (
                <option key={x.id} value={x.id}>
                  [{x.method}] {x.name}
                </option>
              ))}
            </select>

            {selectedZaloApiId ? (
              <div className="card" style={{ padding: 12 }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(zaloApis.find((x) => x.id === selectedZaloApiId) || {}, null, 2)}
                </pre>
              </div>
            ) : null}

            <input className="input" placeholder="client-id (để trống dùng .env)" value={zaloClientId} onChange={(e) => setZaloClientId(e.target.value)} />
            <input className="input" placeholder="token (để trống dùng .env)" value={zaloToken} onChange={(e) => setZaloToken(e.target.value)} />

            <div className="stack">
              <div><b>Path Params (JSON)</b></div>
              <textarea className="textarea" value={zaloPathParamsText} onChange={(e) => setZaloPathParamsText(e.target.value)} />
              <div><b>Query Params (JSON)</b></div>
              <textarea className="textarea" value={zaloQueryText} onChange={(e) => setZaloQueryText(e.target.value)} />
            </div>

            <div className="row">
              <button className="button" type="button" disabled={zaloBusy || !selectedZaloApiId} onClick={runZaloTest}>
                {zaloBusy ? "Đang test..." : "Test API"}
              </button>
            </div>

            {zaloResult ? (
              <div className="card" style={{ padding: 12 }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(zaloResult, null, 2)}</pre>
              </div>
            ) : null}
          </motion.div>
        ) : null}

        {tab === "logs" ? (
          <motion.div key="logs" className="split" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="card stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="section-title">Log server</h3>
                <motion.button className="button secondary" type="button" whileTap={{ scale: 0.98 }} onClick={() => loadLogs().catch((e) => setError((e as Error).message))}>
                  Tải lại
                </motion.button>
              </div>
              <div className="stack" style={{ maxHeight: 520, overflow: "auto" }}>
                {logs.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="card"
                    style={{ textAlign: "left", padding: 12, cursor: "pointer", opacity: selectedLogId === l.id ? 1 : 0.85 }}
                    onClick={() => setSelectedLogId(l.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <b>{l.method}</b>
                      <span className="muted" style={{ fontSize: 12 }}>{l.created_at}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4, wordBreak: "break-word" }}>
                      {l.status} • {l.duration_ms}ms • {l.path}
                    </div>
                  </button>
                ))}
                {logs.length === 0 ? <div className="muted">Chưa có log.</div> : null}
              </div>
            </div>

            <div className="card stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="section-title">Chi tiết</h3>
                {selectedLogId ? <span className="muted">#{selectedLogId}</span> : null}
              </div>
              {logDetail ? (
                <>
                  <div className="row">
                    <span className="pill muted">Method: {logDetail.method}</span>
                    <span className="pill muted">Status: {logDetail.status}</span>
                    <span className="pill muted">Time: {logDetail.duration_ms}ms</span>
                  </div>
                  <div className="muted" style={{ wordBreak: "break-word" }}>{logDetail.path}</div>
                  <div className="stack">
                    <div><b>Request headers</b></div>
                    <pre className="card" style={{ padding: 12, whiteSpace: "pre-wrap" }}>{pretty(logDetail.req_headers_json)}</pre>
                    <div><b>Request body</b></div>
                    <pre className="card" style={{ padding: 12, whiteSpace: "pre-wrap" }}>{pretty(logDetail.req_body_json)}</pre>
                    <div><b>Response headers</b></div>
                    <pre className="card" style={{ padding: 12, whiteSpace: "pre-wrap" }}>{pretty(logDetail.res_headers_json)}</pre>
                    <div><b>Response body</b></div>
                    <pre className="card" style={{ padding: 12, whiteSpace: "pre-wrap" }}>{pretty(logDetail.res_body_text)}</pre>
                  </div>
                </>
              ) : (
                <div className="muted">Chọn 1 log để xem.</div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

