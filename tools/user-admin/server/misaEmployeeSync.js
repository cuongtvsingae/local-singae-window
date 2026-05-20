const { fetchEmployeesFromMisa } = require("../../windowsshell/server/misaClient");

/**
 * Logic đồng bộ MISA — gọi từ authStore (inject run/get/hashPassword).
 * User mới: role `user`, đủ cột MISA + mật khẩu MISA_DEFAULT_PASSWORD.
 */
function createMisaSync({ run, get, hashPassword, nowIso }) {
  return async function syncEmployeesFromMisa() {
    const defaultPassword = String(process.env.MISA_DEFAULT_PASSWORD || "MisaSync1!").trim();
    if (defaultPassword.length < 8) {
      throw new Error("MISA_DEFAULT_PASSWORD must be at least 8 characters");
    }

    const r = await fetchEmployeesFromMisa();
    if (r.status !== 200) {
      throw new Error(`MISA HTTP ${r.status}`);
    }
    const payload = r.data;
    if (!payload || payload.Success !== true || payload.Code !== 0) {
      throw new Error(payload?.UserMessage || payload?.SystemMessage || "MISA API failure");
    }
    const list = Array.isArray(payload.Data) ? payload.Data : [];
    let inserted = 0;
    let updated = 0;
    const skipped = [];
    const errors = [];

    const crypto = require("crypto");

    for (const emp of list) {
      const code = String(emp.EmployeeCode || "").trim();
      if (!code || code.length < 3) {
        skipped.push({ code, reason: "username/EmployeeCode too short (min 3)" });
        continue;
      }
      const fullName = String(emp.FullName || "").trim() || code;
      const orgName = String(emp.OrganizationUnitName || "").trim();
      const jobName = String(emp.JobPositionName || "").trim();
      const orgId = emp.OrganizationUnitID != null && emp.OrganizationUnitID !== "" ? Number(emp.OrganizationUnitID) : null;
      const jobId = emp.JobPositionID != null ? String(emp.JobPositionID) : "";
      const shift = String(emp.ShiftCode || "").trim();
      const statusId = emp.EmployeeStatusID != null && emp.EmployeeStatusID !== "" ? Number(emp.EmployeeStatusID) : null;
      const isActive = statusId === 2 ? 0 : 1;

      const existing = await get(`SELECT id FROM users WHERE username = ?`, [code]);
      const ts = nowIso();

      try {
        if (existing) {
          await run(
            `UPDATE users SET
              role = 'user',
              full_name = ?, company_level = ?, department = ?,
              employee_code = ?, organization_unit_id = ?, organization_unit_name = ?,
              job_position_id = ?, job_position_name = ?, shift_code = ?, employee_status_id = ?,
              misa_synced_at = ?, updated_at = ?, is_active = ?
            WHERE username = ?`,
            [
              fullName,
              jobName,
              orgName,
              code,
              orgId,
              orgName || null,
              jobId || null,
              jobName || null,
              shift || null,
              statusId,
              ts,
              ts,
              isActive,
              code
            ]
          );
          updated += 1;
        } else {
          const id = crypto.randomUUID();
          const pwHash = hashPassword(defaultPassword);
          await run(
            `INSERT INTO users (
              id, username, password_hash, role, full_name, avatar_url,
              gender, company_level, department, work_schedule, tool_meta_json,
              strengths, weaknesses, hobbies, address, phone,
              is_active, created_at, updated_at,
              employee_code, organization_unit_id, organization_unit_name,
              job_position_id, job_position_name, shift_code, employee_status_id, misa_synced_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              id,
              code,
              pwHash,
              "user",
              fullName,
              "",
              "",
              jobName,
              orgName,
              "",
              "{}",
              "",
              "",
              "",
              "",
              "",
              isActive,
              ts,
              ts,
              code,
              orgId,
              orgName || null,
              jobId || null,
              jobName || null,
              shift || null,
              statusId,
              ts
            ]
          );
          inserted += 1;
        }
      } catch (e) {
        errors.push({ code, message: e?.message || String(e) });
      }
    }

    return {
      totalFromApi: list.length,
      inserted,
      updated,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 30),
      errorCount: errors.length,
      errors: errors.slice(0, 30),
      serverTime: payload.ServerTime
    };
  };
}

module.exports = { createMisaSync };
