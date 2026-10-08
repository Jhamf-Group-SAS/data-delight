/**
 * lib/sessionValidity.js — server-side check applied after a JWT verifies:
 * the account must still exist, be active, and the token must have been
 * issued at or after the last password change.
 */

export const SESSION_EXPIRED_MESSAGE = "Sesión expirada, inicie sesión de nuevo";

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {{ id: number, iat?: number }} decoded - verified JWT payload
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function checkSessionValidity(pool, decoded) {
  const [rows] = await pool.execute(
    "SELECT activo, UNIX_TIMESTAMP(password_changed_at) AS changed_at FROM usuarios WHERE id = ?",
    [decoded.id]
  );
  const row = rows[0];
  if (!row || !row.activo) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  if (row.changed_at != null && !(Number(decoded.iat) >= Math.floor(Number(row.changed_at)))) {
    return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  }
  return { ok: true };
}
