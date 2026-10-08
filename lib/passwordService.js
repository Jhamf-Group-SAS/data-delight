/**
 * lib/passwordService.js — admin password reset + self-service password
 * change. Same conventions as lib/usuariosService.js: injected `pool`,
 * plain `{ httpStatus, body }` results, audited through
 * runConditionalAuditedUpdate. Neither the password nor its hash is ever
 * written to the audit row (old_value/new_value stay NULL).
 */

import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { extractActor } from "./accessScope.js";
import { buildAuditRecord } from "./auditRecord.js";
import { runConditionalAuditedUpdate } from "./conditionalAuditedUpdate.js";
import { getUsuarioById } from "./usuariosService.js";
import { protectedUserGuard } from "./protectedUsers.js";

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently ignores bytes past 72; reject instead of truncating.
export const MAX_PASSWORD_LENGTH = 72;
export const GENERATED_PASSWORD_LENGTH = 12;
// Unambiguous charset: no 0/O, 1/l/I.
export const GENERATED_PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const BCRYPT_COST = 10;

export function generatePassword(length = GENERATED_PASSWORD_LENGTH) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += GENERATED_PASSWORD_CHARSET[randomInt(GENERATED_PASSWORD_CHARSET.length)];
  }
  return out;
}

const fail = (httpStatus, error) => ({ httpStatus, body: { ok: false, error } });

function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return "password_too_short";
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) {
    return "password_too_long";
  }
  return null;
}

function buildPasswordAudit({ actor, id, action, reason }) {
  return buildAuditRecord({
    actor: extractActor(actor),
    entity: "usuario",
    entityId: String(id),
    action,
    field: "password",
    oldValue: null,
    newValue: null,
    reason,
  });
}

async function storePassword(pool, { id, password, auditRecord }) {
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  return runConditionalAuditedUpdate(pool, {
    updateSql: "UPDATE usuarios SET password = ?, password_changed_at = NOW() WHERE id = ?",
    updateParams: [hash, id],
    auditRecord,
  });
}

/**
 * `PATCH /api/admin/usuarios/:id/password` — admin-only. Either sets the
 * given `password` or, with `generate`, creates a random one. Returns the
 * plain password once so the UI can show it.
 */
export async function resetUsuarioPassword(pool, { actor, id, password, generate, reason, protectedUsernames = [] }) {
  if (actor?.rol !== "admin") return fail(403, "forbidden");

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason === "") return fail(400, "reason_required");

  const plain = generate === true ? generatePassword() : password;
  const invalid = validatePassword(plain);
  if (invalid) return fail(400, invalid);

  const usuario = await getUsuarioById(pool, id);
  if (!usuario) return fail(404, "not_found");

  const blocked = protectedUserGuard(usuario, actor, protectedUsernames);
  if (blocked) return blocked;

  const auditRecord = buildPasswordAudit({
    actor,
    id,
    action: "password_reset",
    reason: trimmedReason,
  });
  const result = await storePassword(pool, { id, password: plain, auditRecord });
  if (!result.ok) return fail(404, "not_found");

  return { httpStatus: 200, body: { ok: true, password: plain, auditId: result.auditId } };
}

/**
 * `POST /api/auth/change-password` — any authenticated user, own account
 * only (the id comes from the verified token, never the body).
 */
export async function changeOwnPassword(pool, { actor, currentPassword, newPassword }) {
  if (typeof currentPassword !== "string" || currentPassword === "") {
    return fail(400, "current_password_required");
  }
  const invalid = validatePassword(newPassword);
  if (invalid) return fail(400, invalid);
  if (newPassword === currentPassword) return fail(400, "password_unchanged");

  const [rows] = await pool.execute("SELECT password FROM usuarios WHERE id = ?", [actor.id]);
  const matches = rows[0] ? await bcrypt.compare(currentPassword, rows[0].password) : false;
  // Generic on purpose; 400 (not 401/403) so clients don't treat it as a dead session.
  if (!matches) return fail(400, "invalid_current_password");

  const auditRecord = buildPasswordAudit({
    actor,
    id: actor.id,
    action: "password_change",
    reason: "self-service",
  });
  const result = await storePassword(pool, { id: actor.id, password: newPassword, auditRecord });
  if (!result.ok) return fail(404, "not_found");

  return { httpStatus: 200, body: { ok: true, auditId: result.auditId } };
}
