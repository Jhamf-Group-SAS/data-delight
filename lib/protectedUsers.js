/**
 * lib/protectedUsers.js — protected admin accounts. A protected account can
 * only be modified (password, edit, status, delete) by itself. The list
 * comes from env PROTECTED_USERNAMES (see lib/config.js); never hardcoded.
 */

/** Parses a comma-separated list into trimmed, lowercased, non-empty names. */
export function parseProtectedUsernames(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== "");
}

/** Case-insensitive membership test against an already-parsed list. */
export function isProtected(username, list) {
  if (typeof username !== "string" || !Array.isArray(list) || list.length === 0) return false;
  return list.includes(username.trim().toLowerCase());
}

/**
 * Returns a `{ httpStatus, body }` 403 result when `target` is protected and
 * the actor is a different user; otherwise `null` (proceed).
 */
export function protectedUserGuard(target, actor, list) {
  if (!target || !isProtected(target.username, list)) return null;
  if (Number(actor?.id) === Number(target.id)) return null;
  return { httpStatus: 403, body: { ok: false, error: "protected_user" } };
}
