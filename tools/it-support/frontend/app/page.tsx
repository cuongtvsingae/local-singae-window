"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
 
function normalizeAssistantPlainText(input: string): string {
  // Single source of truth for UI validation/normalization.
  // Contract: assistant message is plain text, uses "\n" for newlines,
  // "- " or "• " for bullets, and "*...*" for bold.
  let t = String(input || "");

  // Convert common escaped sequences returned as literals
  // - handle "\\n" and "\\\\n"
  t = t.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
  // - handle "\\*" and "\\\\*"
  t = t.replace(/\\\\\*/g, "*").replace(/\\\*/g, "*");

  // Backward-compat: strip HTML tags if the model ever outputs them
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/p\s*>/gi, "\n");
  t = t.replace(/<p[^>]*>/gi, "");
  t = t.replace(/<li[^>]*>/gi, "- ");
  t = t.replace(/<\/li\s*>/gi, "\n");
  t = t.replace(/<ul[^>]*>|<\/ul\s*>|<ol[^>]*>|<\/ol\s*>/gi, "");
  t = t.replace(/<[^>]+>/g, "");

  // Normalize line breaks + whitespace
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n");

  // Normalize bullets: "* item" or "• item" -> "- item"
  t = t.replace(/^\s*[\*\u2022]\s+/gm, "- ");
  // Normalize numbered lists: "1) item" / "1. item" -> "- item"
  t = t.replace(/^\s*\d+\s*[\.\)]\s+/gm, "- ");

  // Bold normalization:
  // - Convert legacy *bold* -> **bold**
  // - Remove any remaining single '*' so UI never shows stray stars
  // (We keep '**' pairs for bold rendering.)
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "**$1**");
  t = t.replace(/(?<!\*)\*(?!\*)/g, "");

  return t.trimEnd();
}

function normalizeUserPlainText(input: string): string {
  // Keep user text readable; do NOT strip single '*' aggressively.
  let t = String(input || "");
  t = t.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Defensive: strip HTML tags if pasted
  t = t.replace(/<[^>]+>/g, "");
  // Normalize bullets a bit for consistency
  t = t.replace(/^\s*[\u2022]\s+/gm, "- ");
  return t.trimEnd();
}

function renderInlineBold(line: string): JSX.Element {
  const s = String(line || "");
  const nodes: Array<string | JSX.Element> = [];
  let lastIndex = 0;
  // Prefer **bold**; keep backward-compat for *bold*
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > lastIndex) nodes.push(s.slice(lastIndex, start));
    const boldText = m[1] ?? m[2] ?? "";
    nodes.push(<b key={`${start}-${end}`}>{boldText}</b>);
    lastIndex = end;
  }
  if (lastIndex < s.length) nodes.push(s.slice(lastIndex));
  return <>{nodes}</>;
}

function renderRichPlainMessage(text: string): JSX.Element {
  const raw = normalizeAssistantPlainText(text);
  const lines = raw.split("\n");
  const out: JSX.Element[] = [];
  let i = 0;
  const isBulletLine = (ln: string) => /^[-•]\s+/.test(ln.trim());
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i] ?? "")) {
        const ln = (lines[i] ?? "").trim().replace(/^[-•]\s+/, "");
        items.push(ln);
        i++;
      }
      out.push(
        <ul key={`ul-${i}`} style={{ margin: "6px 0 0 12px", paddingLeft: 6 }}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInlineBold(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line.trim().length === 0) {
      out.push(<br key={`br-${i}`} />);
      i++;
      continue;
    }
    out.push(
      <span key={`ln-${i}`}>
        {renderInlineBold(line)}
        <br />
      </span>,
    );
    i++;
  }
  return <div>{out}</div>;
}

type Task = {
  id: string;
  title: string;
  description: string;
  room?: string;
  type?: string;
  deadline?: string | null;
  status: string;
  created_at?: string;
  created_by?: string;
  created_by_username?: string | null;
  created_by_full_name?: string | null;
  level?: "high" | "medium" | "low";
};

type LearningForm = {
  id: string;
  topic: string;
  keywords: string;
  desc: string;
  solution: string;
};

function extractRoom(text: string) {
  const t = String(text || "");
  const patterns = [
    /(?:^|\n)\s*phòng\s*:\s*(.+)$/im,
    /(?:^|\n)\s*\[room\]\s*(.+)$/im,
    /(?:^|\n)\s*room\s*:\s*(.+)$/im,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) return String(m[1]).trim();
  }
  return "";
}

function levelLabel(level?: string) {
  const lv = (level || "medium").toLowerCase();
  if (lv === "high") return "High";
  if (lv === "low") return "Low";
  return "Medium";
}

type DashboardSummary = {
  total_tasks: number;
  open_tasks: number;
  in_progress_tasks: number;
  done_tasks: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: string;
  created_at?: string;
  kind?: string;
  fullText?: string;
  suggestions?: string[];
};

type DragLayerState = {
  task: Task;
  x: number;
  y: number;
  width: number;
  height: number;
  overStatus: string | null;
  phase: "dragging" | "snapping";
  targetX: number;
  targetY: number;
};

type AiDecision = {
  status: "ok" | "error";
  action: string;
  data: Record<string, unknown>;
  message: string;
  suggestions?: string[];
  next?: string;
};

const defaultTaskForm = {
  title: "",
  description: "",
  room: "",
  type: "",
  level: "medium" as "high" | "medium" | "low",
  deadline: "",
};

const boardColumns = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
] as const;

export default function HomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [ragReady, setRagReady] = useState<boolean>(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskForm, setTaskForm] = useState(defaultTaskForm);
  const [taskRooms, setTaskRooms] = useState<Array<{ id: number; name: string }>>([]);
  const [taskTypes, setTaskTypes] = useState<Array<{ id: number; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [pinnedTopTask, setPinnedTopTask] = useState<{ id: string; status: string } | null>(null);
  const [dragLayer, setDragLayer] = useState<DragLayerState | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [learningTask, setLearningTask] = useState<Task | null>(null);
  const [learningForm, setLearningForm] = useState<LearningForm>({
    id: "",
    topic: "",
    keywords: "",
    desc: "",
    solution: "",
  });
  const [learningBusy, setLearningBusy] = useState(false);
  const [learningError, setLearningError] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [adminUsers, setAdminUsers] = useState<{ id: number; username: string; full_name: string | null; gender: string | null }[]>([]);
  const [adminUserGender, setAdminUserGender] = useState<Record<number, "male" | "female">>({});

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: "Xin chào, tôi là trợ lý IT.\nBạn cần tôi hỗ trợ xử lý sự cố hay tạo ticket order IT nào?" },
  ]);
  const [lastDecision, setLastDecision] = useState<AiDecision | null>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const pendingQuickRepliesRef = useRef<string[]>([]);
  const pendingQuickRepliesMsgIdRef = useRef<string | null>(null);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const typingMsgIdRef = useRef<string | null>(null);
  const typingAnimRafRef = useRef<number | null>(null);
  const typingAnimMsgIdRef = useRef<string | null>(null);
  const typingAnimStartRef = useRef<number>(0);
  const typingAnimLastRevealRef = useRef<number>(0);

  const dragOverStatusRef = useRef<string | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragMoveRef = useRef<{ x: number; y: number; overStatus: string | null } | null>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);
  const assistantBodyRef = useRef<HTMLDivElement | null>(null);
  const scrollAssistantToBottom = (smooth = true) => {
    const el = assistantBodyRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  };

  const stopTypingAnimation = () => {
    if (typingAnimRafRef.current) {
      cancelAnimationFrame(typingAnimRafRef.current);
      typingAnimRafRef.current = null;
    }
    typingAnimMsgIdRef.current = null;
  };

  const startTypingAnimation = (msgId: string, fullText: string) => {
    stopTypingAnimation();
    typingAnimMsgIdRef.current = msgId;
    typingAnimStartRef.current = performance.now();
    typingAnimLastRevealRef.current = 0;

    const charsPerSecond = 55; // tune for smoothness
    const scrollEveryChars = 10;

    const tick = () => {
      const id = typingAnimMsgIdRef.current;
      if (!id) return;
      const now = performance.now();
      const elapsed = Math.max(0, now - typingAnimStartRef.current);
      const targetCount = Math.min(fullText.length, Math.floor((elapsed / 1000) * charsPerSecond));

      if (targetCount !== typingAnimLastRevealRef.current) {
        typingAnimLastRevealRef.current = targetCount;
        const slice = fullText.slice(0, targetCount);
        setAssistantMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: slice, fullText } : m)),
        );

        if (targetCount % scrollEveryChars === 0 || targetCount >= fullText.length) {
          requestAnimationFrame(() => scrollAssistantToBottom(false));
        }
      }

      if (targetCount >= fullText.length) {
        stopTypingAnimation();
        // After typing completes, show suggestions for THIS assistant message only.
        if (pendingQuickRepliesMsgIdRef.current === msgId && pendingQuickRepliesRef.current.length > 0) {
          setQuickReplies(pendingQuickRepliesRef.current);
        } else {
          setQuickReplies([]);
        }
        pendingQuickRepliesMsgIdRef.current = null;
        return;
      }
      typingAnimRafRef.current = requestAnimationFrame(tick);
    };

    typingAnimRafRef.current = requestAnimationFrame(tick);
  };

  const setQuickRepliesFromAi = (ai: AiDecision | null | undefined) => {
    const s = (ai as any)?.data?.suggestions ?? (ai as any)?.suggestions;
    const arr = Array.isArray(s) ? s.map((x) => String(x || "").trim()).filter(Boolean) : [];
    // suggestions are optional; show only when present (any count)
    pendingQuickRepliesRef.current = arr.length > 0 ? arr : [];
  };

  useEffect(() => {
    requestAnimationFrame(() => scrollAssistantToBottom(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantMessages.length]);

  const [role, setRole] = useState<"admin" | "employee" | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadData = async () => {
    setError("");
    try {
      const [dashboard, taskList, roomsResp, typesResp] = await Promise.all([
        apiGet<DashboardSummary>("/dashboard/summary"),
        apiGet<Task[]>("/tasks"),
        apiGet<{ status: "ok"; data: Array<{ id: number; name: string }> }>("/meta/rooms"),
        apiGet<{ status: "ok"; data: Array<{ id: number; name: string }> }>("/meta/types"),
      ]);
      setSummary(dashboard);
      setTasks(taskList);
      setTaskRooms(roomsResp.data || []);
      setTaskTypes(typesResp.data || []);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadChatHistory = async () => {
    try {
      const resp = await apiGet<{
        status: "ok";
        data: { id: number; role: string; text: string; created_at: string; kind?: string; user_action?: string; ai_action?: string }[];
      }>("/chat/history");
      const msgs = (resp?.data || []).map((m) => ({
        id: `h-${m.id}`,
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: (() => {
          const s = String(m.text || "");
          // history should always display validated/normalized text
          return m.role === "assistant" ? normalizeAssistantPlainText(s) : normalizeUserPlainText(s);
        })(),
        created_at: m.created_at,
        kind: String(m.kind || ""),
        action: String((m.role === "assistant" ? m.ai_action : m.user_action) || ""),
      }));
      if (msgs.length > 0) {
        setAssistantMessages((prev) => {
          const hasAnyHistory = prev.some((p) => p.id.startsWith("h-"));
          return hasAnyHistory ? prev : [...prev, ...msgs];
        });
      }
    } catch {
      // ignore when not logged in
    }
  };

  useEffect(() => {
    (async () => {
      // First-load cache: check RAG status once
      let firstDone = false;
      try {
        firstDone = localStorage.getItem("it_support_first_load_done") === "1";
      } catch {}
      if (!firstDone) {
        try {
          // Poll status briefly
          for (let i = 0; i < 15; i++) {
            try {
              const st = await apiGet<{ status: "ok"; built_at: string; doc_count: number }>("/rag/status");
              if (st?.status === "ok" && st.doc_count > 0) {
                setRagReady(true);
                try { localStorage.setItem("it_support_first_load_done", "1"); } catch {}
                break;
              }
            } catch {
              // wait and retry
            }
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch {
          // ignore
        }
      } else {
        setRagReady(true);
      }
      await loadData();
      await loadChatHistory();

      // Update assistant greeting with user profile (gender + name) when logged in
      try {
        const me = await apiGet<{ status: "ok"; data: { full_name?: string | null; gender?: string | null } | null }>("/me");
        const fullName = String(me?.data?.full_name || "").trim();
        const callName = fullName ? fullName.split(/\s+/).slice(-1)[0] : "";
        const gender = String(me?.data?.gender || "").trim();
        const honor = gender === "male" ? "anh" : gender === "female" ? "chị" : "anh/chị";
        const rid = Math.floor(100000 + Math.random() * 900000); // 6 digits
        const greet =
          `Em chào ${honor}${callName ? " " + callName : ""}, em là trợ lý IT của anh Cường (ID: ${rid}), ${honor} cần em hỗ trợ xử lý sự cố hay tạo ticket order IT nào?.\n`;
        setAssistantMessages((prev) => prev.map((m) => (m.id === "welcome" ? { ...m, text: greet } : m)));
      } catch {
        // ignore if not logged in
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiGet<{ status: "ok"; data: { role?: string } | null }>("/me");
        const r = me?.data?.role;
        setRole(r === "admin" || r === "employee" ? r : null);
      } catch {
        setRole(null);
      }
    })();
  }, []);

  useEffect(() => {
    dragOverStatusRef.current = dragOverStatus;
  }, [dragOverStatus]);

  useEffect(() => {
    if (!isAssistantOpen) return;
    const body = assistantBodyRef.current;
    if (!body) return;
    body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [assistantMessages.length, isAssistantOpen]);

  useEffect(() => {
    if (isAssistantOpen) {
      setUnreadCount(0);
      return;
    }
    const last = assistantMessages[assistantMessages.length - 1];
    if (last && last.role === "assistant") {
      setUnreadCount((c) => c + 1);
    }
  }, [assistantMessages, isAssistantOpen]);

  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!String(taskForm.title || "").trim()) throw new Error("Thiếu tiêu đề.");
      if (!String(taskForm.type || "").trim()) throw new Error("Thiếu loại (type).");
      if (!String(taskForm.room || "").trim()) throw new Error("Thiếu phòng (room).");
      if (!String(taskForm.level || "").trim()) throw new Error("Thiếu mức độ (level).");
      await apiPost("/tasks", {
        title: taskForm.title,
        description: taskForm.description,
        room: taskForm.room,
        type: taskForm.type,
        level: taskForm.level,
        deadline: taskForm.deadline || null,
      });
      setTaskForm(defaultTaskForm);
      setIsOrderModalOpen(false);
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const adminClearChat = async () => {
    if (adminBusy) return;
    if (!confirm("Xóa toàn bộ lịch sử chat? Hành động này không thể hoàn tác.")) return;
    setAdminBusy(true);
    try {
      await apiDelete<{ status: "ok" }>("/admin/clear-chat");
      const me = await apiGet<{ status: "ok"; data: { full_name?: string | null; gender?: string | null } | null }>("/me");
        const fullName = String(me?.data?.full_name || "").trim();
        const callName = fullName ? fullName.split(/\s+/).slice(-1)[0] : "";
        const gender = String(me?.data?.gender || "").trim();
        const honor = gender === "male" ? "anh" : gender === "female" ? "chị" : "anh/chị";
        const rid = Math.floor(100000 + Math.random() * 900000); // 6 digits
        const greet =
          `Em chào ${honor}${callName ? " " + callName : ""}, em là trợ lý IT của anh Cường (ID: ${rid}), ${honor} cần em hỗ trợ xử lý sự cố hay tạo ticket order IT nào?.\n`;
      setUnreadCount(0);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setAdminBusy(false);
    }
  };

  const adminClearTasks = async () => {
    if (adminBusy) return;
    if (!confirm("Xóa toàn bộ task? Hành động này không thể hoàn tác.")) return;
    setAdminBusy(true);
    try {
      await apiDelete<{ status: "ok" }>("/admin/clear-tasks");
      await loadData();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setAdminBusy(false);
    }
  };

  const adminSearchUsers = async () => {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      const resp = await apiGet<{ status: "ok"; data: { id: number; username: string; full_name: string | null; role: string; gender: string | null }[] }>(
        `/admin/users${adminUserQuery ? `?q=${encodeURIComponent(adminUserQuery)}` : ""}`,
      );
      setAdminUsers(resp.data || []);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setAdminBusy(false);
    }
  };

  const adminUpdateGender = async (userId: number, gender: "male" | "female") => {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await apiPatch(`/admin/users/${userId}/gender`, { gender });
      setAdminUserGender((prev) => ({ ...prev, [userId]: gender }));
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setAdminBusy(false);
    }
  };

  const adminRestartLog = async () => {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await apiPost<{ status: "ok" }>(`/admin/restart`);
      alert("Đã ghi nhận yêu cầu restart (được log). Server dev sẽ tự restart khi có thay đổi (nodemon).");
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setAdminBusy(false);
    }
  };

  const openLearningModal = (task: Task) => {
    const keywords = [task.type, task.room, task.title].filter(Boolean).join(", ");
    setLearningForm({
      id: `TASK-${task.id}`,
      topic: task.title || "",
      keywords,
      desc: task.description || task.title || "",
      solution: "",
    });
    setLearningTask(task);
    setLearningError("");
  };

  const submitLearningDone = async () => {
    if (!learningTask || learningBusy) return;
    const valid = ["id", "topic", "keywords", "desc", "solution"].every(
      (k) => String((learningForm as any)[k] || "").trim().length > 0,
    );
    if (!valid) {
      setLearningError("Vui lòng điền đủ 5 field kiến thức.");
      return;
    }
    setLearningBusy(true);
    setLearningError("");
    try {
      await apiPatch(`/tasks/${learningTask.id}/status`, {
        status: "done",
        learning: learningForm,
      });
      setLearningTask(null);
      await loadData();
    } catch (err) {
      setLearningError(String((err as Error)?.message || err));
    } finally {
      setLearningBusy(false);
    }
  };

  const moveTaskStatus = async (taskId: string, status: string) => {
    if (role !== "admin") {
      const note: ChatMessage = {
        id: `sys-${Date.now()}`,
        role: "assistant",
        text: `Bạn là nhân viên nên không đổi trạng thái trực tiếp. Tôi đã ghi nhận yêu cầu đổi trạng thái task #${taskId} -> ${status}.`,
      };
      setAssistantMessages((prev) => [...prev, note]);
      return;
    }
    if (busy) return;
    if (String(status).toLowerCase() === "done") {
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (task) {
        openLearningModal(task);
        setPinnedTopTask(null);
        setDragOverStatus(null);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await apiPatch(`/tasks/${taskId}/status`, { status });
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clearDragState = () => {
    setDragTaskId(null);
    setDragOverStatus(null);
    setDragLayer(null);
    dragMoveRef.current = null;
  };

  const resizeAssistantInput = () => {
    const element = assistantInputRef.current;
    if (!element) return;
    element.style.height = "44px";
    element.style.height = `${Math.min(element.scrollHeight, 172)}px`;
  };

  const getTaskRenderStatus = (task: Task) => {
    if (dragTaskId && task.id === dragTaskId) {
      return dragOverStatus ?? task.status;
    }
    return task.status;
  };

  const tasksByStatus = (status: string) => {
    const list = tasks.filter((task) => getTaskRenderStatus(task) === status);
    if (dragTaskId && dragOverStatus === status) {
      const dragIndex = list.findIndex((task) => task.id === dragTaskId);
      if (dragIndex >= 0) {
        const [dragTask] = list.splice(dragIndex, 1);
        list.unshift(dragTask);
      }
    }
    if (pinnedTopTask && pinnedTopTask.status === status) {
      const index = list.findIndex((task) => task.id === pinnedTopTask.id);
      if (index > 0) {
        const [task] = list.splice(index, 1);
        list.unshift(task);
      }
    }
    return list;
  };

  const formatWhen = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.floor((startOfToday.getTime() - startOfThat.getTime()) / (24 * 3600 * 1000));
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const dayLabel = dayDiff === 0 ? "today" : dayDiff === 1 ? "yesterday" : `${dd}/${MM}/${yyyy}`;
    return `${hh}:${mm} - ${dayLabel}`;
  };

  const startTaskPointerDrag = (task: Task, event: ReactPointerEvent<HTMLDivElement>) => {
    if (role !== "admin") {
      // employees cannot drag status; open full task modal instead
      setSelectedTask(task);
      return;
    }
    if (event.button !== 0) return;

    const elementRect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - elementRect.left;
    const offsetY = event.clientY - elementRect.top;
    const initialX = event.clientX - offsetX;
    const initialY = event.clientY - offsetY;

    event.preventDefault();
    document.body.style.userSelect = "none";

    setDragTaskId(task.id);
    setDragOverStatus(task.status);
    setDragLayer({
      task,
      x: elementRect.left,
      y: elementRect.top,
      width: elementRect.width,
      height: elementRect.height,
      overStatus: task.status,
      phase: "dragging",
      targetX: elementRect.left,
      targetY: elementRect.top,
    });

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextX = moveEvent.clientX - offsetX;
      const nextY = moveEvent.clientY - offsetY;
      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
      const column = target?.closest("[data-column-status]") as HTMLElement | null;
      const nextStatus = column?.dataset.columnStatus ?? null;
      dragMoveRef.current = { x: nextX, y: nextY, overStatus: nextStatus };

      if (dragRafRef.current !== null) return;

      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        const moveData = dragMoveRef.current;
        if (!moveData) return;
        setDragOverStatus(moveData.overStatus);
        setDragLayer((prev) =>
          prev
            ? {
                ...prev,
                x: moveData.x,
                y: moveData.y,
                overStatus: moveData.overStatus,
              }
            : prev,
        );
      });
    };

    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.userSelect = "";
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      const finalStatus = dragOverStatusRef.current ?? task.status;

      if (finalStatus === task.status) {
        clearDragState();
        return;
      }

      setDragOverStatus(finalStatus);
      setPinnedTopTask({ id: task.id, status: finalStatus });

      await moveTaskStatus(task.id, finalStatus);
      setDragOverStatus(null);

      window.requestAnimationFrame(() => {
        const realTask = document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement | null;
        const realRect = realTask?.getBoundingClientRect();
        setDragLayer((prev) =>
          prev
            ? {
                ...prev,
                phase: "snapping",
                targetX: realRect ? realRect.left : prev.targetX,
                targetY: realRect ? realRect.top : prev.targetY,
                width: realRect ? realRect.width : prev.width,
                height: realRect ? realRect.height : prev.height,
                overStatus: finalStatus,
              }
            : prev,
        );
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const sendAssistantMessageWithText = (inputText: string) => {
    // Preserve user newlines; only trim the end (avoid losing intentional internal line breaks).
    const raw = String(inputText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const trimmed = raw.trimEnd();
    if (!trimmed.trim()) return;
    if (assistantTyping) return; // avoid overlapping requests / animations

    // Any new user message should hide existing suggestions immediately (no stale options)
    setQuickReplies([]);
    pendingQuickRepliesRef.current = [];
    pendingQuickRepliesMsgIdRef.current = null;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: normalizeUserPlainText(trimmed),
    };
    setAssistantMessages((prev) => [...prev, userMessage]);
    setAssistantInput("");
    if (assistantInputRef.current) {
      assistantInputRef.current.style.height = "44px";
    }

    (async () => {
      try {
        setAssistantTyping(true);
        const typingId = `a-${Date.now()}`;
        typingMsgIdRef.current = typingId;
        setAssistantMessages((prev) => [...prev, { id: typingId, role: "assistant", text: "" }]);
        const ai = await apiPost<AiDecision>("/ai/decide", { prompt: trimmed });
        setLastDecision(ai);
        // Always refresh suggestions for every new AI message (not only first time)
        setQuickRepliesFromAi(ai);
        setQuickReplies([]);

        const content = normalizeAssistantPlainText(String(ai?.message || ""));
        const id = typingMsgIdRef.current || typingId;
        pendingQuickRepliesMsgIdRef.current = id;
        setAssistantTyping(false);
        setAssistantMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, text: "", fullText: content, suggestions: pendingQuickRepliesRef.current.length > 0 ? pendingQuickRepliesRef.current : undefined }
              : m,
          ),
        );
        startTypingAnimation(id, content);
        typingMsgIdRef.current = null;

        requestAnimationFrame(() => scrollAssistantToBottom(false));

        if (ai?.status === "ok" && ["TASK", "CREATE_TASK", "UPDATE_TASK_STATUS"].includes(ai.action)) {
          await loadData();
        }
      } catch (err) {
        const id = typingMsgIdRef.current || `a-${Date.now()}`;
        const text =
          (err as Error).message ||
          "Lỗi gọi đến AI. Vui lòng thử lại sau (có thể là 401/503/504).";
        if (typingMsgIdRef.current) {
          setAssistantMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text, fullText: undefined } : m)));
        } else {
          setAssistantMessages((prev) => [...prev, { id, role: "assistant", text, fullText: undefined }]);
        }
        typingMsgIdRef.current = null;
        setAssistantTyping(false);
        setQuickReplies([]);
        pendingQuickRepliesRef.current = [];
        pendingQuickRepliesMsgIdRef.current = null;
      }
    })();
  };

  const sendAssistantMessage = () => {
    sendAssistantMessageWithText(assistantInput);
  };

  const sendQuickReply = (text: string) => {
    const t = String(text || "").trim();
    if (!t) return;
    // animate old suggestions away
    setQuickReplies([]);
    pendingQuickRepliesRef.current = [];
    pendingQuickRepliesMsgIdRef.current = null;
    sendAssistantMessageWithText(t);
  };

  return (
    <motion.div
      className="container stack"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="card row"
        style={{ justifyContent: "space-between" }}
      >
        <div>
          <h2 className="header-title">PHÒNG IT - SINGAE</h2>
          {!ragReady ? (
            <span className="row" style={{ gap: 8, alignItems: "center", marginTop: 6 }}>
              <span className="loader" aria-label="Đang tải kiến thức" />
              <span className="muted">Đang tải kiến thức lần đầu...</span>
            </span>
          ) : null}
        </div>
        <div className="row">
          {role === "admin" ? (
            <>
              <button className="button secondary xs" type="button" onClick={adminClearChat} disabled={adminBusy}>
                Xóa chat
              </button>
              <button className="button secondary xs" type="button" onClick={adminClearTasks} disabled={adminBusy}>
                Xóa task
              </button>
              <button className="button secondary xs" type="button" onClick={adminRestartLog} disabled={adminBusy}>
                Log restart
              </button>
            </>
          ) : null}
          <button className="button icon-btn order-button" title="Tạo task" onClick={() => setIsOrderModalOpen(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M5 6h14M5 11h9M5 16h7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M18 14v6M15 17h6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {error ? (
          <motion.div
            className="card error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {summary ? (
        <motion.div className="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03, duration: 0.16 }}>
          {[
            { label: "Tổng", value: summary.total_tasks },
            { label: "Mới", value: summary.open_tasks },
            { label: "Đang xử lý", value: summary.in_progress_tasks },
            { label: "Hoàn tất", value: summary.done_tasks },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              className="card"
              whileHover={{ y: -4, scale: 1.01 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <b>{stat.label}</b>
              <div className="stat-value">{stat.value}</div>
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {role === "admin" ? (
        <motion.div className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 className="section-title">Admin: Quản lý người dùng</h3>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                placeholder="Tìm username/full name"
                value={adminUserQuery}
                onChange={(e) => setAdminUserQuery(e.target.value)}
              />
              <button className="button secondary sm" type="button" onClick={adminSearchUsers} disabled={adminBusy}>
                Tìm
              </button>
            </div>
          </div>
          <div className="muted">Chọn lại giới tính cho tài khoản. Bắt buộc hợp lệ: male/female.</div>
          <div className="stack" style={{ gap: 8 }}>
            {adminUsers.map((u) => {
              const current = (adminUserGender[u.id] || (u.gender as "male" | "female" | null)) || "";
              return (
                <div key={u.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div><b>{u.username}</b>{u.full_name ? ` • ${u.full_name}` : ""}</div>
                    <div className="muted">Gender hiện tại: {u.gender || "chưa đặt"}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <select
                      className="input"
                      value={current}
                      onChange={(e) => setAdminUserGender((prev) => ({ ...prev, [u.id]: e.target.value as "male" | "female" }))}
                    >
                      <option value="" disabled>
                        Chọn giới tính
                      </option>
                      <option value="male">male</option>
                      <option value="female">female</option>
                    </select>
                    <button
                      className="button sm"
                      type="button"
                      disabled={!((adminUserGender[u.id] as string) || "") || adminBusy}
                      onClick={() => adminUpdateGender(u.id, (adminUserGender[u.id] as "male" | "female")!)}
                    >
                      Lưu
                    </button>
                  </div>
                </div>
              );
            })}
            {adminUsers.length === 0 ? <div className="muted">Không có kết quả.</div> : null}
          </div>
        </motion.div>
      ) : null}

      <motion.div className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="section-title">IT task board</h3>
          {tasks.length > 0 ? <div className="muted">{tasks.length} task</div> : null}
        </div>
        <div className="kanban-grid">
          {boardColumns.map((column) => (
            <motion.div
              key={column.key}
              className={`kanban-column status-${column.key} ${dragOverStatus === column.key ? "drag-active" : ""}`}
              data-column-status={column.key}
              layout
            >
              <div className="kanban-header">
                <h4>{column.label}</h4>
                <span>{tasksByStatus(column.key).length}</span>
              </div>
              <div className="kanban-list" data-column-dropzone={column.key}>
                <AnimatePresence>
                  {tasksByStatus(column.key).map((task) => (
                    <motion.div
                      key={task.id}
                      data-task-id={task.id}
                      className={`card kanban-card status-${task.status} ${dragTaskId === task.id ? "task-hidden" : ""}`}
                      onPointerDown={role === "admin" ? (event) => startTaskPointerDrag(task, event) : undefined}
                      onDoubleClick={role === "admin" ? () => setSelectedTask(task) : undefined}
                      onClick={role !== "admin" ? () => setSelectedTask(task) : undefined}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: dragTaskId === task.id ? 0 : 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        layout: { type: "spring", stiffness: 520, damping: 34, mass: 0.65 },
                        opacity: { duration: 0 },
                        y: { duration: 0.1 },
                      }}
                      whileHover={{ scale: 1.008 }}
                      whileTap={role !== "admin" ? { scale: 0.995 } : undefined}
                      layout
                    >
                      {(() => {
                        const room = extractRoom(task.description || "");
                        const lv = (task.level || "medium") as "high" | "medium" | "low";
                        return (
                          <>
                            <div className="task-card-head">
                              <div className="task-title">{task.title}</div>
                              {role === "admin" ? (
                                <button
                                  className="button secondary xs task-info-btn"
                                  type="button"
                                  title="Xem chi tiết"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(task);
                                  }}
                                >
                                  i
                                </button>
                              ) : null}
                            </div>
                            <div className="task-desc">{task.description}</div>
                            <div className="task-meta">
                              <div className="task-meta-row">
                                <span className={`pill level-${lv}`}>Level: {levelLabel(lv)}</span>
                                {room ? <span className="pill muted">Phòng: {room}</span> : null}
                                <span className="pill muted">Status: {task.status}</span>
                              </div>
                              <div style={{ marginTop: 6 }}>
                                {(() => {
                                  const who =
                                    task.created_by_full_name ||
                                    task.created_by_username ||
                                    (task.created_by === "assistant" ? "Trợ lý IT" : "User");
                                  return `Tạo bởi: ${who}`;
                                })()}
                                {task.created_at ? ` • ${formatWhen(task.created_at)}` : ""}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedTask ? (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedTask(null)}
          >
            <motion.div
              className="modal-panel card stack"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="section-title">Task #{selectedTask.id}</h3>
                <button className="button secondary sm" type="button" onClick={() => setSelectedTask(null)}>Đóng</button>
              </div>
              <div><b>Title:</b> {selectedTask.title}</div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {selectedTask.type ? <span className="pill muted">Loại: {selectedTask.type}</span> : null}
                {selectedTask.room ? <span className="pill muted">Phòng: {selectedTask.room}</span> : null}
                {selectedTask.deadline ? <span className="pill muted">Deadline: {formatWhen(selectedTask.deadline)}</span> : null}
              </div>
              <div><b>Description:</b></div>
              <div style={{ whiteSpace: "pre-wrap" }}>{selectedTask.description}</div>
              {(() => {
                const lv = (selectedTask.level || "medium") as "high" | "medium" | "low";
                return (
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="pill muted">Status: {selectedTask.status}</span>
                    <span className={`pill level-${lv}`}>Level: {levelLabel(lv)}</span>
                    <span className="pill muted">
                      Tạo bởi: {selectedTask.created_by === "assistant" ? "Trợ lý IT" : "User"}
                    </span>
                  </div>
                );
              })()}
              <div className="muted">
                {(() => {
                  const who =
                    selectedTask.created_by_full_name ||
                    selectedTask.created_by_username ||
                    (selectedTask.created_by === "assistant" ? "Trợ lý IT" : "User");
                  return `Tạo bởi: ${who}`;
                })()}{selectedTask.created_at ? ` • ${formatWhen(selectedTask.created_at)}` : ""}
              </div>
              {role !== "admin" ? (
                <div className="card" style={{ padding: 12 }}>
                  <div className="muted">Nhân viên không đổi trạng thái trực tiếp. Nhắn trong chat để admin/trợ lý xử lý.</div>
                  <button className="button secondary sm" type="button" onClick={() => { setIsAssistantOpen(true); setSelectedTask(null); }}>
                    Mở chat
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {learningTask ? (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLearningTask(null)}
          >
            <motion.div
              className="modal-panel card stack"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="section-title">Cập nhật kiến thức (Task #{learningTask.id})</h3>
                <button
                  className="button secondary sm"
                  type="button"
                  onClick={() => setLearningTask(null)}
                >
                  Đóng
                </button>
              </div>
              <div className="muted">Điền đủ 5 field để AI học khi task được đánh dấu Done.</div>
              <label className="stack">
                <span>ID</span>
                <input
                  className="input"
                  value={learningForm.id}
                  onChange={(e) => setLearningForm((prev) => ({ ...prev, id: e.target.value }))}
                />
              </label>
              <label className="stack">
                <span>Topic</span>
                <input
                  className="input"
                  value={learningForm.topic}
                  onChange={(e) => setLearningForm((prev) => ({ ...prev, topic: e.target.value }))}
                />
              </label>
              <label className="stack">
                <span>Keywords (cách nhau bởi dấu phẩy)</span>
                <input
                  className="input"
                  value={learningForm.keywords}
                  onChange={(e) => setLearningForm((prev) => ({ ...prev, keywords: e.target.value }))}
                />
              </label>
              <label className="stack">
                <span>Desc</span>
                <textarea
                  className="input"
                  rows={3}
                  value={learningForm.desc}
                  onChange={(e) => setLearningForm((prev) => ({ ...prev, desc: e.target.value }))}
                />
              </label>
              <label className="stack">
                <span>Solution</span>
                <textarea
                  className="input"
                  rows={3}
                  value={learningForm.solution}
                  onChange={(e) => setLearningForm((prev) => ({ ...prev, solution: e.target.value }))}
                />
              </label>
              {learningError ? <div className="error">{learningError}</div> : null}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="button secondary" type="button" onClick={() => setLearningTask(null)}>
                  Huỷ
                </button>
                <button className="button" type="button" disabled={learningBusy} onClick={submitLearningDone}>
                  Lưu & Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {dragLayer ? (
        <motion.div
          className={`card drag-layer-card status-${dragLayer.overStatus ?? dragLayer.task.status} ${dragLayer.phase}`}
          initial={false}
          animate={{
            left: dragLayer.x,
            top: dragLayer.y,
            x: dragLayer.phase === "dragging" ? 0 : dragLayer.targetX - dragLayer.x,
            y: dragLayer.phase === "dragging" ? 0 : dragLayer.targetY - dragLayer.y,
            scale: dragLayer.phase === "dragging" ? 1.02 : 0.98,
            opacity: 0.98,
            width: dragLayer.width,
            height: dragLayer.height,
          }}
          transition={
            dragLayer.phase === "dragging"
              ? { duration: 0 }
              : { type: "spring", stiffness: 560, damping: 34, mass: 0.62 }
          }
          onAnimationComplete={() => {
            if (dragLayer.phase !== "dragging") {
              clearDragState();
            }
          }}
        >
          <div><b>{dragLayer.task.title}</b></div>
          <div>{dragLayer.task.description}</div>
        </motion.div>
      ) : null}

      <AnimatePresence>
        {isOrderModalOpen ? (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOrderModalOpen(false)}
          >
            <motion.form
              className="modal-panel card stack"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={createTask}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="section-title">Order Task</h3>
                <button type="button" title="Close" className="button icon-btn secondary modal-close" onClick={() => setIsOrderModalOpen(false)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                    <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <input className="input" placeholder="Tiêu đề" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
              <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select className="input" value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })} style={{ minWidth: 220 }}>
                  <option value="">Chọn loại</option>
                  {taskTypes.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <select className="input" value={taskForm.room} onChange={(e) => setTaskForm({ ...taskForm, room: e.target.value })} style={{ minWidth: 220 }}>
                  <option value="">Chọn phòng</option>
                  {taskRooms.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
                <select
                  className="input"
                  value={taskForm.level}
                  onChange={(e) => setTaskForm({ ...taskForm, level: e.target.value as "high" | "medium" | "low" })}
                  style={{ minWidth: 220 }}
                >
                  <option value="high">Gấp (high)</option>
                  <option value="medium">Bình thường (medium)</option>
                  <option value="low">Chưa gấp (low)</option>
                </select>
              </div>
              <input
                className="input"
                type="datetime-local"
                value={taskForm.deadline}
                onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                placeholder="Deadline"
              />
              <textarea className="textarea" placeholder="Mô tả (triệu chứng/lỗi/username/ngữ cảnh...)" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />

              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="button sm" title="Tạo task" disabled={busy} style={{ paddingInline: 14 }}>
                  Tạo task
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isAssistantOpen ? (
          <motion.div
            className="assistant-panel card"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
          >
            <div className="assistant-header">
              <div>
                <div className="assistant-name">Trợ lý IT</div>
                <div className="muted assistant-status">Hỗ trợ xử lý sự cố và tạo task tự động</div>
              </div>
              <motion.button
                className="assistant-minimize-btn"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsAssistantOpen(false)}
              >
                -
              </motion.button>
            </div>
            <div className="assistant-body" ref={assistantBodyRef} style={{ paddingBottom: 90 }}>
              <AnimatePresence>
                {assistantMessages.map((message) => {
                  const isTypingBubble =
                    assistantTyping &&
                    message.role === "assistant" &&
                    message.text.trim().length === 0 &&
                    !message.fullText;
                  return (
                    <motion.div
                      key={message.id}
                      className={`assistant-bubble ${message.role}`}
                      data-msg-id={message.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      {isTypingBubble ? (
                        <span className="typing-dots" aria-label="Đang gõ">
                          <span className="dot" />
                          <span className="dot" />
                          <span className="dot" />
                        </span>
                      ) : (
                        renderRichPlainMessage(message.text)
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {/* Suggestions overlay (top-layer) to avoid reflow/jank in chat layout */}
            <AnimatePresence>
              {quickReplies.length > 0 ? (
                <motion.div
                  className="assistant-quick-replies"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: "absolute",
                    left: 10,
                    right: 10,
                    bottom: 58, // sit just above input row
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    padding: 10,
                    background: "transparent",
                    backdropFilter: "none",
                    border: "0",
                    borderRadius: 0,
                    zIndex: 50,
                  }}
                >
                  {quickReplies.map((q, idx) => (
                    <motion.button
                      key={`${idx}-${q}`}
                      type="button"
                      className="button secondary xs"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => sendQuickReply(q)}
                      title="Gửi nhanh"
                      style={{
                        flex: "0 1 auto",
                        maxWidth: "100%",
                        whiteSpace: "normal",
                        textAlign: "left",
                        paddingInline: 10,
                      }}
                    >
                      {q}
                    </motion.button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="assistant-input-row">
              <textarea
                ref={assistantInputRef}
                className="input assistant-textarea"
                placeholder="Nhập yêu cầu cho IT..."
                value={assistantInput}
                rows={1}
                onChange={(event) => {
                  setAssistantInput(event.target.value);
                  resizeAssistantInput();
                }}
                onKeyDown={(event) => {
                  // Enter = send. Shift+Enter = newline.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendAssistantMessage();
                  }
                }}
              />
              <button className="button icon-btn assistant-send" title="Send" onClick={sendAssistantMessage}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path d="M4 12l15-7-3 7 3 7-15-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        className="assistant-fab"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="IT Support"
        onClick={() => setIsAssistantOpen((prev) => !prev)}
      >
        <span className="assistant-fab-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 6h11l3 3v9H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M15 6v3h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M8 11h6M8 14h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M18.5 14.5l2 2-3.2 3.2-2-2zM16.8 16.2l.8-.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {unreadCount > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: "0 6px",
              borderRadius: 999,
              background: "rgba(255, 127, 143, 0.95)",
              color: "#081024",
              fontSize: 11,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.35)",
              boxShadow: "0 10px 18px rgba(0,0,0,0.35)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </motion.button>
    </motion.div>
  );
}

