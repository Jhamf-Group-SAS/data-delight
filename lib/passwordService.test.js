import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcrypt";
import {
  resetUsuarioPassword,
  changeOwnPassword,
  generatePassword,
  GENERATED_PASSWORD_CHARSET,
} from "./passwordService.js";

const admin = { id: 1, rol: "admin" };
const operador = { id: 7, rol: "operador" };

function makePool({ usuario = { id: 42 }, storedHash = null, updateAffectedRows = 1 } = {}) {
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    execute: vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: updateAffectedRows }])
      .mockResolvedValueOnce([{ insertId: 70 }]),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn().mockResolvedValue(connection),
    execute: vi.fn().mockImplementation(async (sql) => {
      if (sql.includes("SELECT password")) return [storedHash ? [{ password: storedHash }] : []];
      return [usuario ? [usuario] : []];
    }),
  };
  return { pool, connection };
}

describe("passwordService — resetUsuarioPassword", () => {
  it("sets the given password, hashes it, and returns it once", async () => {
    const { pool, connection } = makePool();
    const result = await resetUsuarioPassword(pool, { actor: admin, id: 42, password: "NuevaClave1", reason: "olvido" });

    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ ok: true, password: "NuevaClave1", auditId: 70 });
    const [sql, params] = connection.execute.mock.calls[0];
    expect(sql).toContain("password_changed_at = NOW()");
    expect(params[0]).not.toBe("NuevaClave1");
    expect(await bcrypt.compare("NuevaClave1", params[0])).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it("generates a 12-char password from the unambiguous charset", async () => {
    const { pool } = makePool();
    const result = await resetUsuarioPassword(pool, { actor: admin, id: 42, generate: true, reason: "reset" });

    expect(result.httpStatus).toBe(200);
    expect(result.body.password).toHaveLength(12);
    for (const ch of result.body.password) expect(GENERATED_PASSWORD_CHARSET).toContain(ch);
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it("requires a reason", async () => {
    const { pool, connection } = makePool();
    const result = await resetUsuarioPassword(pool, { actor: admin, id: 42, password: "NuevaClave1", reason: "  " });
    expect(result.httpStatus).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "reason_required" });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const { pool } = makePool();
    const result = await resetUsuarioPassword(pool, { actor: admin, id: 42, password: "short", reason: "x" });
    expect(result.httpStatus).toBe(400);
    expect(result.body.error).toBe("password_too_short");
  });

  it("rejects non-admin actors", async () => {
    const { pool } = makePool();
    const result = await resetUsuarioPassword(pool, { actor: operador, id: 42, password: "NuevaClave1", reason: "x" });
    expect(result.httpStatus).toBe(403);
  });

  it("returns 404 when the target user does not exist", async () => {
    const { pool, connection } = makePool({ usuario: null });
    const result = await resetUsuarioPassword(pool, { actor: admin, id: 999, password: "NuevaClave1", reason: "x" });
    expect(result.httpStatus).toBe(404);
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it("writes an audit row with no password or hash", async () => {
    const { pool, connection } = makePool();
    await resetUsuarioPassword(pool, { actor: admin, id: 42, password: "NuevaClave1", reason: "motivo" });

    const [sql, params] = connection.execute.mock.calls[1];
    expect(sql).toContain("INSERT INTO admin_audit_log");
    expect(params.slice(0, 9)).toEqual([1, "admin", "usuario", "42", "password_reset", "password", null, null, "motivo"]);
    expect(JSON.stringify(params)).not.toContain("NuevaClave1");
    expect(JSON.stringify(params)).not.toContain("$2");
  });
});

describe("passwordService — changeOwnPassword", () => {
  it("rejects a wrong current password with a generic error and no write", async () => {
    const storedHash = await bcrypt.hash("Actual1234", 4);
    const { pool, connection } = makePool({ storedHash });
    const result = await changeOwnPassword(pool, { actor: operador, currentPassword: "Otra12345", newPassword: "Nueva12345" });
    expect(result.httpStatus).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "invalid_current_password" });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it("updates the hash and audits as password_change on success", async () => {
    const storedHash = await bcrypt.hash("Actual1234", 4);
    const { pool, connection } = makePool({ storedHash });
    const result = await changeOwnPassword(pool, { actor: operador, currentPassword: "Actual1234", newPassword: "Nueva12345" });

    expect(result.httpStatus).toBe(200);
    const [sql, params] = connection.execute.mock.calls[0];
    expect(sql).toContain("password_changed_at = NOW()");
    expect(params[1]).toBe(7);
    expect(await bcrypt.compare("Nueva12345", params[0])).toBe(true);
    const audit = connection.execute.mock.calls[1][1];
    expect(audit.slice(0, 9)).toEqual([7, "operador", "usuario", "7", "password_change", "password", null, null, "self-service"]);
  });

  it("rejects short or unchanged new passwords", async () => {
    const { pool } = makePool();
    const short = await changeOwnPassword(pool, { actor: operador, currentPassword: "Actual1234", newPassword: "abc" });
    expect(short.body.error).toBe("password_too_short");
    const same = await changeOwnPassword(pool, { actor: operador, currentPassword: "Actual1234", newPassword: "Actual1234" });
    expect(same.body.error).toBe("password_unchanged");
  });
});
