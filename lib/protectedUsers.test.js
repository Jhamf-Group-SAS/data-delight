import { describe, it, expect, vi } from "vitest";
import { parseProtectedUsernames, isProtected, protectedUserGuard } from "./protectedUsers.js";
import { loadConfig } from "./config.js";
import { resetUsuarioPassword } from "./passwordService.js";
import { updateUsuario, changeUsuarioEstado, deleteUsuarioGuarded } from "./usuariosService.js";

const PROTECTED = ["lmurillo"];
const target = { id: 5, username: "LMurillo", nombre: "L", rol: "admin" };
const otherAdmin = { id: 1, rol: "admin" };
const self = { id: 5, rol: "admin" };
const forbidden = { ok: false, error: "protected_user" };

/** Pool whose SELECT returns `row`; transactional connection reports success. */
function makePool(row) {
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    execute: vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 90 }]),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  const pool = {
    getConnection: vi.fn().mockResolvedValue(connection),
    execute: vi.fn().mockImplementation(async (sql) => {
      if (sql.includes("FROM usuarios WHERE id")) return [row ? [row] : []];
      if (sql.startsWith("SELECT 1")) return [[]];
      return [{ affectedRows: 1 }];
    }),
  };
  return { pool, connection };
}

describe("protectedUsers — parsing", () => {
  it("trims, lowercases and drops empty entries", () => {
    expect(parseProtectedUsernames(" LMurillo , ,Admin2,")).toEqual(["lmurillo", "admin2"]);
  });
  it("empty or missing env means no protection", () => {
    expect(parseProtectedUsernames(undefined)).toEqual([]);
    expect(parseProtectedUsernames("")).toEqual([]);
    expect(isProtected("lmurillo", [])).toBe(false);
  });
  it("matches case-insensitively", () => {
    expect(isProtected("LMURILLO", PROTECTED)).toBe(true);
    expect(isProtected("otro", PROTECTED)).toBe(false);
  });
  it("loadConfig exposes the parsed list", () => {
    expect(loadConfig({ JWT_SECRET: "x", PROTECTED_USERNAMES: "A, b" }).protectedUsernames).toEqual(["a", "b"]);
  });
  it("guard blocks other actors only", () => {
    expect(protectedUserGuard(target, otherAdmin, PROTECTED)?.httpStatus).toBe(403);
    expect(protectedUserGuard(target, self, PROTECTED)).toBeNull();
    expect(protectedUserGuard({ id: 9, username: "pepe" }, otherAdmin, PROTECTED)).toBeNull();
  });
});

describe("protected users — every admin mutation", () => {
  it("blocks password reset by another admin, allows self reset", async () => {
    const blocked = await resetUsuarioPassword(makePool(target).pool, {
      actor: otherAdmin, id: 5, password: "NuevaClave1", reason: "x", protectedUsernames: PROTECTED,
    });
    expect(blocked.httpStatus).toBe(403);
    expect(blocked.body).toEqual(forbidden);

    const own = await resetUsuarioPassword(makePool(target).pool, {
      actor: self, id: 5, password: "NuevaClave1", reason: "x", protectedUsernames: PROTECTED,
    });
    expect(own.httpStatus).toBe(200);
  });

  it("blocks edit by another admin without writing", async () => {
    const { pool, connection } = makePool(target);
    const result = await updateUsuario(pool, {
      actor: otherAdmin, id: 5, nombre: "Nuevo", reason: "x", protectedUsernames: PROTECTED,
    });
    expect(result).toEqual({ httpStatus: 403, body: forbidden });
    expect(connection.beginTransaction).not.toHaveBeenCalled();
  });

  it("blocks estado change by another admin, allows it on unprotected users", async () => {
    const { pool, connection } = makePool(target);
    const result = await changeUsuarioEstado(pool, {
      actor: otherAdmin, id: 5, activo: false, reason: "x", protectedUsernames: PROTECTED,
    });
    expect(result).toEqual({ httpStatus: 403, body: forbidden });
    expect(connection.beginTransaction).not.toHaveBeenCalled();

    const ok = await changeUsuarioEstado(makePool({ id: 9, username: "pepe" }).pool, {
      actor: otherAdmin, id: 9, activo: false, reason: "x", protectedUsernames: PROTECTED,
    });
    expect(ok.httpStatus).toBe(200);
  });

  it("blocks delete by another admin before any history query", async () => {
    const { pool } = makePool(target);
    const result = await deleteUsuarioGuarded(pool, otherAdmin, 5, PROTECTED);
    expect(result).toEqual({ httpStatus: 403, body: forbidden });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  it("keeps the self-delete guard for the protected user", async () => {
    const result = await deleteUsuarioGuarded(makePool(target).pool, self, 5, PROTECTED);
    expect(result.httpStatus).toBe(400);
  });

  it("empty list leaves everything unprotected", async () => {
    const result = await resetUsuarioPassword(makePool(target).pool, {
      actor: otherAdmin, id: 5, password: "NuevaClave1", reason: "x",
    });
    expect(result.httpStatus).toBe(200);
  });
});
