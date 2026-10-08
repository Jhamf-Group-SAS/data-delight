/**
 * lib/usuariosService.js — usuarios admin-panel service layer (Phase 5).
 *
 * Same pattern as lib/registrosService.js (Phase 4): every function takes
 * an injected `pool` (mysql2/promise Pool or a mock with matching
 * `.execute`/`.getConnection` methods) and returns a plain
 * `{ httpStatus, body }` result the Express route handler maps directly
 * onto `res.status(...).json(...)`.
 *
 * Routes live under `/api/admin/usuarios/...` (confirmed live prefix, see
 * openspec tasks.md Phase 0 finding — NOT `/api/usuarios/...` as design.md
 * literally wrote) and are already gated by the existing
 * `authenticateToken` + `requireAdmin` middleware in server.js for the
 * plain edit/delete/audit actions. `changeUsuarioEstado` additionally
 * distinguishes `reactivate_forbidden` from a generic `forbidden` based on
 * the *requested* direction (design's estado sequence diagram), which
 * `requireAdmin` alone cannot express — that branching lives here.
 */

import { extractActor } from "./accessScope.js";
import { buildAuditRecord } from "./auditRecord.js";
import { runConditionalAuditedUpdate } from "./conditionalAuditedUpdate.js";
import { protectedUserGuard } from "./protectedUsers.js";

/**
 * Fetches a single usuario by id (no `password` column — never leaked
 * through this service layer).
 *
 * @param {import("mysql2/promise").Pool} pool
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
export async function getUsuarioById(pool, id) {
  const [rows] = await pool.execute(
    "SELECT id, username, nombre, rol, activo, created_at FROM usuarios WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

/**
 * `PATCH /api/admin/usuarios/:id` — admin-only edit (design API Surface).
 * `email` is NOT an editable field despite design.md listing it: the live
 * `usuarios` schema (migration.sql PASO 1, confirmed 0.1) has no `email`
 * column — a design-level `[U]` inaccuracy, dropped here rather than
 * writing to a column that doesn't exist. `id` and other immutable
 * identifiers are never accepted.
 *
 * Exactly one of `nombre`/`rol` may change per call: `admin_audit_log`
 * (design D3) is a single-field-per-row schema, so a combined
 * nombre+rol edit has no faithful single-row audit representation yet —
 * rejected as `invalid_payload` rather than silently dropping one field
 * or under-auditing the change. Not covered by the Phase 5 RED-test list;
 * flagged as a documented scope decision for a future PR if simultaneous
 * multi-field edits are required.
 *
 * @param {import("mysql2/promise").Pool} pool
 * @param {object} params
 * @param {{ id: number, rol: string }} params.actor
 * @param {string|number} params.id
 * @param {string} [params.nombre]
 * @param {string} [params.rol]
 * @param {string} params.reason
 */
export async function updateUsuario(pool, { actor, id, nombre, rol, reason, protectedUsernames = [] }) {
  const usuario = await getUsuarioById(pool, id);
  if (!usuario) {
    return { httpStatus: 404, body: { ok: false, error: "not_found" } };
  }

  const blocked = protectedUserGuard(usuario, actor, protectedUsernames);
  if (blocked) return blocked;

  if (rol !== undefined && !["admin", "operador"].includes(rol)) {
    return { httpStatus: 400, body: { ok: false, error: "invalid_rol" } };
  }

  const nombreProvided = nombre !== undefined;
  const rolProvided = rol !== undefined;
  if (nombreProvided === rolProvided) {
    // both false (nothing to update) or both true (unsupported combined edit)
    return { httpStatus: 400, body: { ok: false, error: "invalid_payload" } };
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason === "") {
    return { httpStatus: 400, body: { ok: false, error: "reason_required" } };
  }

  const field = rolProvided ? "rol" : "nombre";
  const newValue = rolProvided ? rol : nombre;
  const oldValue = rolProvided ? usuario.rol : usuario.nombre;

  const auditRecord = buildAuditRecord({
    actor: extractActor(actor),
    entity: "usuario",
    entityId: String(id),
    action: "user_update",
    field,
    oldValue,
    newValue,
    reason: trimmedReason,
  });

  const result = await runConditionalAuditedUpdate(pool, {
    updateSql: `UPDATE usuarios SET ${field} = ? WHERE id = ?`,
    updateParams: [newValue, id],
    auditRecord,
  });

  if (!result.ok) {
    // The row existed at fetch time but the UPDATE affected 0 rows —
    // treated as "no longer there" (e.g. concurrent delete) rather than a
    // distinct conflict code, since this route has no CAS condition.
    return { httpStatus: 404, body: { ok: false, error: "not_found" } };
  }

  const body = { ok: true, id: Number(id), auditId: result.auditId };
  body[field] = newValue;
  return { httpStatus: 200, body };
}

/**
 * `PATCH /api/admin/usuarios/:id/estado` — reversible deactivate/reactivate
 * (design D5, sequence "user deactivation / reactivation"). Deactivating
 * AND reactivating both require `admin` (confirmed: operador has zero
 * access to this endpoint), but a non-admin *reactivate* attempt reports
 * the specific `reactivate_forbidden` code while a non-admin *deactivate*
 * attempt reports the generic `forbidden` code — the distinction the
 * design's sequence diagram encodes via requested-direction branching,
 * which a blanket `requireAdmin` middleware check cannot express by
 * itself, so it lives here instead.
 *
 * No pre-fetch (unlike `updateUsuario`/`changeRegistroStatus`): the
 * conditional `UPDATE ... WHERE id = ? AND activo <> ?` is the only
 * existence+state check, matching design's sequence diagram literally (no
 * separate SELECT step shown). 0 affected rows — unknown id or already in
 * the requested state — maps to `409 stale_estado`, reusing the same
 * "reuse 4.3's transaction helper" stale semantics task 5.2 calls for;
 * design's API table does not enumerate a `409` for this route, so this is
 * a documented, reasonable extension (same category as PR 2's 4.3 extra
 * `404` branch).
 *
 * @param {import("mysql2/promise").Pool} pool
 * @param {object} params
 * @param {{ id: number, rol: string }} params.actor
 * @param {string|number} params.id
 * @param {boolean} params.activo - requested target state
 * @param {string} params.reason
 */
export async function changeUsuarioEstado(pool, { actor, id, activo, reason, protectedUsernames = [] }) {
  if (activo === true && actor.rol !== "admin") {
    return { httpStatus: 403, body: { ok: false, error: "reactivate_forbidden" } };
  }
  if (actor.rol !== "admin") {
    return { httpStatus: 403, body: { ok: false, error: "forbidden" } };
  }

  if (protectedUsernames.length > 0) {
    const blocked = protectedUserGuard(await getUsuarioById(pool, id), actor, protectedUsernames);
    if (blocked) return blocked;
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason === "") {
    return { httpStatus: 400, body: { ok: false, error: "reason_required" } };
  }

  const auditRecord = buildAuditRecord({
    actor: extractActor(actor),
    entity: "usuario",
    entityId: String(id),
    action: activo ? "user_reactivate" : "user_deactivate",
    field: "activo",
    oldValue: String(!activo),
    newValue: String(activo),
    reason: trimmedReason,
  });

  const result = await runConditionalAuditedUpdate(pool, {
    updateSql: "UPDATE usuarios SET activo = ? WHERE id = ? AND activo <> ?",
    updateParams: [activo ? 1 : 0, id, activo ? 0 : 1],
    auditRecord,
  });

  if (!result.ok) {
    return { httpStatus: 409, body: { ok: false, error: "stale_estado" } };
  }

  return { httpStatus: 200, body: { ok: true, activo, auditId: result.auditId } };
}

/**
 * `DELETE /api/admin/usuarios/:id` — extends the pre-existing route
 * (preserves its self-delete guard verbatim) with the application-level
 * history guard (design D5 / spec "Delete-Guard for Usuarios With
 * History"): the `registros.user_id` FK is `ON DELETE SET NULL` (confirmed
 * 0.1), so it does NOT block deletion at the DB level — the guard MUST be
 * enforced here. Also checks `admin_audit_log.actor_id` (the column
 * `lib/auditRecord.js`'s `buildAuditRecord` actually writes to) so a user
 * who has performed audited actions is preserved too, not just one who
 * has been the *subject* of one.
 *
 * @param {import("mysql2/promise").Pool} pool
 * @param {{ id: number, rol: string }} actor
 * @param {string|number} id
 */
export async function deleteUsuarioGuarded(pool, actor, id, protectedUsernames = []) {
  if (parseInt(id, 10) === actor.id) {
    return { httpStatus: 400, body: { ok: false, error: "No podés eliminar tu propio usuario" } };
  }

  if (protectedUsernames.length > 0) {
    const blocked = protectedUserGuard(await getUsuarioById(pool, id), actor, protectedUsernames);
    if (blocked) return blocked;
  }

  const [registroRefs] = await pool.execute("SELECT 1 FROM registros WHERE user_id = ? LIMIT 1", [id]);
  if (registroRefs.length > 0) {
    return { httpStatus: 409, body: { ok: false, error: "user_has_history" } };
  }

  const [auditRefs] = await pool.execute("SELECT 1 FROM admin_audit_log WHERE actor_id = ? LIMIT 1", [id]);
  if (auditRefs.length > 0) {
    return { httpStatus: 409, body: { ok: false, error: "user_has_history" } };
  }

  const [result] = await pool.execute("DELETE FROM usuarios WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    return { httpStatus: 404, body: { ok: false, error: "not_found" } };
  }

  return { httpStatus: 200, body: { ok: true, message: "Usuario eliminado" } };
}

/**
 * `GET /api/admin/usuarios/:id/audit` — admin-only. Returns rows where
 * this usuario is the audited *entity* (their own account was
 * created/edited/deactivated/reactivated) OR the *actor* (actions they
 * performed on registros or other usuarios), ordered newest first — the
 * broader of the two interpretations the orchestrator instruction left
 * open, matching what an admin reviewing "this user's audit trail" would
 * expect to see.
 *
 * @param {import("mysql2/promise").Pool} pool
 * @param {string|number} id
 */
export async function getUsuarioAuditLog(pool, id) {
  const [rows] = await pool.execute(
    `SELECT * FROM admin_audit_log
     WHERE (entity = 'usuario' AND entity_id = ?) OR actor_id = ?
     ORDER BY created_at DESC`,
    [String(id), id]
  );

  return { httpStatus: 200, body: { ok: true, data: rows } };
}
