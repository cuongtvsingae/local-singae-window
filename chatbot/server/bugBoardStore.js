const { randomBytes } = require("node:crypto");
const { sqlRun, sqlGet, sqlAll, ensureInit } = require("./sqliteStore");

const BUG_TASK_STATUS = {
  NEW: "new",
  REOPEN: "reopen",
  IN_PROGRESS: "in_progress",
  READY_QA: "ready_qa",
  DONE: "done"
};

const BUG_TASK_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
};

const BUG_TASK_SEVERITY = {
  MINOR: "minor",
  MAJOR: "major",
  CRITICAL: "critical",
  BLOCKER: "blocker"
};

function trimText(value, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeStatus(value) {
  const allowed = new Set(Object.values(BUG_TASK_STATUS));
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : BUG_TASK_STATUS.NEW;
}

function normalizePriority(value) {
  const allowed = new Set(Object.values(BUG_TASK_PRIORITY));
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : BUG_TASK_PRIORITY.MEDIUM;
}

function normalizeSeverity(value) {
  const allowed = new Set(Object.values(BUG_TASK_SEVERITY));
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : BUG_TASK_SEVERITY.MAJOR;
}

function normalizeLabels(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => trimText(item, 64))
          .filter(Boolean)
      )
    ).slice(0, 20);
  }
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,\n;|]/g)
        .map((item) => trimText(item, 64))
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function normalizeAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => ({
      id: trimText(item?.id || `att-${randomBytes(6).toString("hex")}`, 80),
      fileName: trimText(item?.fileName, 255),
      mimeType: trimText(item?.mimeType, 120),
      size: Number(item?.size || 0) || 0,
      url: trimText(item?.url, 500)
    }))
    .filter((item) => item.fileName && item.url);
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function hydrateTaskRow(row) {
  if (!row) return null;
  return {
    id: trimText(row.id, 80),
    code: trimText(row.code, 40),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    description: String(row.description || ""),
    stepsToReproduce: String(row.steps_to_reproduce || ""),
    expectedResult: String(row.expected_result || ""),
    actualResult: String(row.actual_result || ""),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    severity: normalizeSeverity(row.severity),
    reporter: trimText(row.reporter, 120),
    assignee: trimText(row.assignee, 120),
    environment: String(row.environment || ""),
    channel: trimText(row.channel, 80),
    conversationId: trimText(row.conversation_id, 160),
    labels: safeJsonParse(row.labels_json, []),
    createdAt: String(row.created_at || "").trim() || null,
    updatedAt: String(row.updated_at || "").trim() || null
  };
}

function hydrateUpdateRow(row) {
  if (!row) return null;
  return {
    id: trimText(row.id, 80),
    taskId: trimText(row.task_id, 80),
    type: trimText(row.type, 40) || "comment",
    text: String(row.text || ""),
    attachments: normalizeAttachments(safeJsonParse(row.attachments_json, [])),
    meta: safeJsonParse(row.meta_json, {}),
    author: trimText(row.author, 120),
    createdAt: String(row.created_at || "").trim() || null
  };
}

async function buildNextBugCode() {
  await ensureInit();
  const row = await sqlGet(`SELECT code FROM bug_board_task ORDER BY created_at DESC LIMIT 1`);
  const current = String(row?.code || "").match(/BUG-(\d+)/i);
  const next = current ? Number(current[1]) + 1 : 1;
  return `BUG-${String(next).padStart(4, "0")}`;
}

async function insertTaskUpdate(taskId, {
  type = "comment",
  text = "",
  attachments = [],
  meta = {},
  author = ""
} = {}) {
  await ensureInit();
  const now = new Date().toISOString();
  const updateId = `bugupd-${randomBytes(8).toString("hex")}`;
  await sqlRun(
    `INSERT INTO bug_board_update(
      id, task_id, type, text, attachments_json, meta_json, author, created_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
    [
      updateId,
      String(taskId || "").trim(),
      trimText(type, 40) || "comment",
      String(text || ""),
      JSON.stringify(normalizeAttachments(attachments)),
      JSON.stringify(meta && typeof meta === "object" ? meta : {}),
      trimText(author, 120),
      now
    ]
  );
  return getBugTaskUpdateById(updateId);
}

async function getBugTaskUpdateById(updateId) {
  await ensureInit();
  const row = await sqlGet(`SELECT * FROM bug_board_update WHERE id = ?`, [String(updateId || "").trim()]);
  return hydrateUpdateRow(row);
}

async function createBugTask(payload = {}) {
  await ensureInit();
  const now = new Date().toISOString();
  const taskId = `bug-${randomBytes(8).toString("hex")}`;
  const code = await buildNextBugCode();
  const labels = normalizeLabels(payload.labels);
  const task = {
    id: taskId,
    code,
    title: trimText(payload.title, 200),
    summary: String(payload.summary || ""),
    description: String(payload.description || ""),
    stepsToReproduce: String(payload.stepsToReproduce || ""),
    expectedResult: String(payload.expectedResult || ""),
    actualResult: String(payload.actualResult || ""),
    status: normalizeStatus(payload.status),
    priority: normalizePriority(payload.priority),
    severity: normalizeSeverity(payload.severity),
    reporter: trimText(payload.reporter, 120),
    assignee: trimText(payload.assignee, 120),
    environment: String(payload.environment || ""),
    channel: trimText(payload.channel, 80),
    conversationId: trimText(payload.conversationId, 160),
    labels,
    createdAt: now,
    updatedAt: now
  };

  if (!task.title) throw new Error("Title is required.");
  if (!task.summary) throw new Error("Summary is required.");

  await sqlRun(
    `INSERT INTO bug_board_task(
      id, code, title, summary, description, steps_to_reproduce, expected_result, actual_result,
      status, priority, severity, reporter, assignee, environment, channel, conversation_id,
      labels_json, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      task.id,
      task.code,
      task.title,
      task.summary,
      task.description,
      task.stepsToReproduce,
      task.expectedResult,
      task.actualResult,
      task.status,
      task.priority,
      task.severity,
      task.reporter,
      task.assignee,
      task.environment,
      task.channel,
      task.conversationId,
      JSON.stringify(task.labels),
      task.createdAt,
      task.updatedAt
    ]
  );

  await insertTaskUpdate(task.id, {
    type: "task_created",
    text: String(payload.initialComment || "").trim() || "Tạo bug mới.",
    attachments: payload.attachments || [],
    meta: {
      status: task.status,
      priority: task.priority,
      severity: task.severity
    },
    author: task.reporter
  });

  return getBugTaskById(task.id);
}

async function listBugTasks({ status = "", limit = 300 } = {}) {
  await ensureInit();
  const lim = Math.max(1, Math.min(1000, Number(limit) || 300));
  const normalizedStatus = String(status || "").trim();
  const rows = normalizedStatus
    ? await sqlAll(
        `SELECT * FROM bug_board_task WHERE status = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?`,
        [normalizeStatus(normalizedStatus), lim]
      )
    : await sqlAll(`SELECT * FROM bug_board_task ORDER BY updated_at DESC, created_at DESC LIMIT ?`, [lim]);
  return rows.map(hydrateTaskRow).filter(Boolean);
}

async function getBugTaskById(taskId) {
  await ensureInit();
  const taskRow = await sqlGet(`SELECT * FROM bug_board_task WHERE id = ?`, [String(taskId || "").trim()]);
  const task = hydrateTaskRow(taskRow);
  if (!task) return null;
  const updateRows = await sqlAll(
    `SELECT * FROM bug_board_update WHERE task_id = ? ORDER BY created_at DESC`,
    [task.id]
  );
  return {
    ...task,
    updates: updateRows.map(hydrateUpdateRow).filter(Boolean)
  };
}

async function updateBugTask(taskId, patch = {}) {
  await ensureInit();
  const existing = await getBugTaskById(taskId);
  if (!existing) return null;
  const next = {
    ...existing,
    title: patch.title !== undefined ? trimText(patch.title, 200) : existing.title,
    summary: patch.summary !== undefined ? String(patch.summary || "") : existing.summary,
    description: patch.description !== undefined ? String(patch.description || "") : existing.description,
    stepsToReproduce:
      patch.stepsToReproduce !== undefined ? String(patch.stepsToReproduce || "") : existing.stepsToReproduce,
    expectedResult: patch.expectedResult !== undefined ? String(patch.expectedResult || "") : existing.expectedResult,
    actualResult: patch.actualResult !== undefined ? String(patch.actualResult || "") : existing.actualResult,
    status: patch.status !== undefined ? normalizeStatus(patch.status) : existing.status,
    priority: patch.priority !== undefined ? normalizePriority(patch.priority) : existing.priority,
    severity: patch.severity !== undefined ? normalizeSeverity(patch.severity) : existing.severity,
    reporter: patch.reporter !== undefined ? trimText(patch.reporter, 120) : existing.reporter,
    assignee: patch.assignee !== undefined ? trimText(patch.assignee, 120) : existing.assignee,
    environment: patch.environment !== undefined ? String(patch.environment || "") : existing.environment,
    channel: patch.channel !== undefined ? trimText(patch.channel, 80) : existing.channel,
    conversationId:
      patch.conversationId !== undefined ? trimText(patch.conversationId, 160) : existing.conversationId,
    labels: patch.labels !== undefined ? normalizeLabels(patch.labels) : existing.labels,
    updatedAt: new Date().toISOString()
  };
  if (!next.title) throw new Error("Title is required.");
  if (!next.summary) throw new Error("Summary is required.");

  await sqlRun(
    `UPDATE bug_board_task
        SET title = ?, summary = ?, description = ?, steps_to_reproduce = ?, expected_result = ?, actual_result = ?,
            status = ?, priority = ?, severity = ?, reporter = ?, assignee = ?, environment = ?,
            channel = ?, conversation_id = ?, labels_json = ?, updated_at = ?
      WHERE id = ?`,
    [
      next.title,
      next.summary,
      next.description,
      next.stepsToReproduce,
      next.expectedResult,
      next.actualResult,
      next.status,
      next.priority,
      next.severity,
      next.reporter,
      next.assignee,
      next.environment,
      next.channel,
      next.conversationId,
      JSON.stringify(next.labels),
      next.updatedAt,
      existing.id
    ]
  );

  const changeMeta = {};
  [
    "title",
    "summary",
    "description",
    "stepsToReproduce",
    "expectedResult",
    "actualResult",
    "status",
    "priority",
    "severity",
    "reporter",
    "assignee",
    "environment",
    "channel",
    "conversationId"
  ].forEach((key) => {
    if (existing[key] !== next[key]) {
      changeMeta[key] = { from: existing[key], to: next[key] };
    }
  });
  if (JSON.stringify(existing.labels) !== JSON.stringify(next.labels)) {
    changeMeta.labels = { from: existing.labels, to: next.labels };
  }
  if (Object.keys(changeMeta).length) {
    await insertTaskUpdate(existing.id, {
      type: "task_updated",
      text: String(patch.updateComment || "").trim() || "Cập nhật thông tin bug.",
      meta: changeMeta,
      author: trimText(patch.updatedBy || patch.reporter || patch.assignee, 120)
    });
  }

  return getBugTaskById(existing.id);
}

async function addBugTaskComment(taskId, payload = {}) {
  await ensureInit();
  const existing = await getBugTaskById(taskId);
  if (!existing) return null;
  const text = String(payload.text || "").trim();
  const attachments = normalizeAttachments(payload.attachments);
  if (!text && !attachments.length) {
    throw new Error("Comment text or attachments are required.");
  }
  const update = await insertTaskUpdate(existing.id, {
    type: trimText(payload.type, 40) || "comment",
    text,
    attachments,
    meta: payload.meta || {},
    author: trimText(payload.author, 120)
  });
  await sqlRun(`UPDATE bug_board_task SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), existing.id]);
  return update;
}

module.exports = {
  BUG_TASK_PRIORITY,
  BUG_TASK_SEVERITY,
  BUG_TASK_STATUS,
  addBugTaskComment,
  createBugTask,
  getBugTaskById,
  listBugTasks,
  normalizeAttachments,
  normalizeLabels,
  updateBugTask
};
