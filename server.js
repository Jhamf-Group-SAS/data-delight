import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  listRegistros,
  getRegistroDetail,
  changeRegistroStatus,
  getRegistroAuditLog,
} from "./lib/registrosService.js";
import { evaluateLoginAttempt } from "./lib/loginPolicy.js";
import {
  updateUsuario,
  changeUsuarioEstado,
  deleteUsuarioGuarded,
  getUsuarioAuditLog,
} from "./lib/usuariosService.js";
import {
  listProyectos,
  createProyecto,
  renameProyecto,
  deleteProyectoGuarded,
} from "./lib/proyectosService.js";
import { loadConfig, ConfigError } from "./lib/config.js";
import { resetUsuarioPassword, changeOwnPassword } from "./lib/passwordService.js";
import { checkSessionValidity } from "./lib/sessionValidity.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── Pool de conexiones ───────────────────────────────────────
const pool = mysql.createPool({
  host:             process.env.DB_HOST,
  user:             process.env.DB_USER,
  password:         process.env.DB_PASSWORD,
  database:         process.env.DB_NAME,
  port:             process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit:  10,
});

// Fail closed: no insecure fallback default. A previously-hardcoded
// fallback value ("regency_jwt_secret_change_in_production") was a
// security finding -- anyone who saw the source code could forge valid
// tokens against any deployment that forgot to set JWT_SECRET. The
// server now refuses to start instead of running with a known secret.
// The check itself lives in lib/config.js (pure, unit-tested) so this is
// only the wiring into process.exit(1) — same observable behavior as
// before the extraction.
let JWT_SECRET;
try {
  ({ jwtSecret: JWT_SECRET } = loadConfig(process.env));
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

const signToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol },
    JWT_SECRET,
    { expiresIn: "8h" } // jwt adds `iat` automatically
  );

// ─── Middlewares ──────────────────────────────────────────────

/**
 * Verifica el JWT en el header Authorization: Bearer <token>
 * Inyecta req.user = { id, username, rol }
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: "Token requerido" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(403).json({ ok: false, error: "Token inválido o expirado" });
  }

  try {
    // Rejects deleted/deactivated users and tokens issued before the last
    // password change (lib/sessionValidity.js).
    const session = await checkSessionValidity(pool, decoded);
    if (!session.ok) {
      return res.status(401).json({ ok: false, error: session.error });
    }
  } catch (error) {
    console.error("❌ Error validando sesión:", error);
    return res.status(500).json({ ok: false, error: "Error en el servidor" });
  }

  req.user = decoded;
  next();
};

/**
 * Solo permite acceso a usuarios con rol 'admin'
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.rol !== "admin") {
    return res.status(403).json({ ok: false, error: "Acceso denegado: se requiere rol admin" });
  }
  next();
};

// ─── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// ─── AUTH ─────────────────────────────────────────────────────

/** POST /api/auth/login */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Usuario y contraseña requeridos" });
    }

    const [rows] = await pool.execute(
      "SELECT id, username, password, nombre, rol, activo FROM usuarios WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
    }

    const user = rows[0];

    // Always run the password comparison, then evaluate activo + password
    // together through one generic response (lib/loginPolicy.js) — a
    // deactivated account MUST fail identically to a wrong password, with
    // no distinguishing message or short-circuit (spec: no info leak).
    const passwordMatch = await bcrypt.compare(password, user.password);
    const attempt = evaluateLoginAttempt({ activo: !!user.activo, passwordMatches: passwordMatch });
    if (!attempt.ok) {
      return res.status(401).json({ ok: false, error: attempt.error });
    }

    const token = signToken(user);

    console.log(`✅ Login: ${user.username} (${user.rol})`);
    res.json({ ok: true, token, user: { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol } });
  } catch (error) {
    console.error("❌ Error login:", error);
    res.status(500).json({ ok: false, error: "Error en el servidor" });
  }
});

/** POST /api/auth/change-password — cambia la contraseña propia; devuelve un token nuevo */
app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
  try {
    const result = await changeOwnPassword(pool, {
      actor: req.user,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
    });
    res.set("Cache-Control", "no-store");
    if (result.httpStatus !== 200) {
      return res.status(result.httpStatus).json(result.body);
    }
    console.log(`✅ Contraseña propia cambiada — usuario: ${req.user.username}`);
    // The old token is now invalidated (password_changed_at), so hand back a fresh one.
    res.json({ ok: true, token: signToken(req.user) });
  } catch (error) {
    console.error("❌ Error cambiando contraseña:", error.message);
    res.status(500).json({ ok: false, error: "Error cambiando contraseña" });
  }
});

/** GET /api/auth/me */
app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ─── REGISTROS ────────────────────────────────────────────────

/** GET /api/registros?page=1&limit=10 o ?all=true */
app.get("/api/registros", authenticateToken, async (req, res) => {
  try {
    // Si solicita exportar todo (sin paginación)
    if (req.query.all === "true") {
      let dataQuery, params;
      if (req.user.rol === "admin") {
        dataQuery = `
          SELECT r.*, u.username AS usuario_nombre
          FROM registros r
          LEFT JOIN usuarios u ON r.user_id = u.id
          ORDER BY r.id_registro DESC
        `;
        params = [];
      } else {
        dataQuery = `
          SELECT * FROM registros
          WHERE user_id = ?
          ORDER BY id_registro DESC
        `;
        params = [req.user.id];
      }
      const [rows] = await pool.query(dataQuery, params);
      console.log(`✅ Registros exportación completa: ${rows.length} — usuario: ${req.user.username}`);
      return res.json({ ok: true, data: rows });
    }

    // Filtros + scope (admin: todos; operador: solo los propios) —
    // extraído a lib/registrosService.js (design D1 / spec "Role-Scoped
    // Registro Search, Filter, and Detail").
    const { q, status, proyecto, centro_operacion, page, pageSize, limit } = req.query;
    const result = await listRegistros(pool, req.user, {
      q,
      status,
      proyecto,
      centro_operacion,
      page,
      pageSize: pageSize || limit, // `limit` kept as a back-compat alias
    });

    console.log(
      `✅ Registros obtenidos: ${result.body.data.length} (total ${result.body.pagination.total}, página ${result.body.pagination.page}/${result.body.pagination.totalPages}) — usuario: ${req.user.username}`
    );
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB obteniendo registros:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo registros: " + error.message });
  }
});

/** GET /api/registros/:id — detalle de un registro (design API Surface) */
app.get("/api/registros/:id", authenticateToken, async (req, res) => {
  try {
    const result = await getRegistroDetail(pool, req.user, req.params.id);
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB obteniendo registro:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo registro" });
  }
});

/**
 * PATCH /api/registros/:id/status — corrección auditada de status
 * (design D4). Body: { fromStatus, toStatus, reason }.
 */
app.patch("/api/registros/:id/status", authenticateToken, async (req, res) => {
  try {
    const { fromStatus, toStatus, reason } = req.body;
    const result = await changeRegistroStatus(pool, {
      actor: req.user,
      id: req.params.id,
      fromStatus,
      toStatus,
      reason,
    });
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB actualizando status:", error);
    res.status(500).json({ ok: false, error: "Error actualizando status" });
  }
});

/** GET /api/registros/:id/audit — historial de auditoría del registro */
app.get("/api/registros/:id/audit", authenticateToken, async (req, res) => {
  try {
    const result = await getRegistroAuditLog(pool, req.user, req.params.id);
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB obteniendo auditoría:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo auditoría" });
  }
});

/** POST /api/registros — status SIEMPRE "NO" (dispara n8n) */
app.post("/api/registros", authenticateToken, async (req, res) => {
  try {
    const { proyecto, centro_operacion, cargo, cedula, nombre, numero } = req.body;

    // ⚠️ status forzado a "NO" en servidor — no se acepta del cliente
    // Este valor dispara el flujo n8n que gestiona el envío de mensajes
    const STATUS_FORZADO = "NO";

    console.log("📝 Guardando registro:", { proyecto, centro_operacion, cargo, cedula, nombre, user_id: req.user.id });

    const [result] = await pool.execute(
      `INSERT INTO registros
       (user_id, proyecto, centro_operacion, cargo, cedula, nombre, numero, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, proyecto, centro_operacion, cargo, cedula, nombre, numero, STATUS_FORZADO]
    );

    console.log(`✅ Registro guardado ID: ${result.insertId}`);
    res.status(201).json({ ok: true, id_registro: result.insertId });
  } catch (error) {
    console.error("❌ Error DB:", error);
    res.status(500).json({ ok: false, error: "Error guardando registro" });
  }
});

/** DELETE /api/registros/:id — solo admin */
app.delete("/api/registros/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Eliminando registro ID: ${id} — solicitado por: ${req.user.username}`);

    const [result] = await pool.execute("DELETE FROM registros WHERE id_registro = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "Registro no encontrado" });
    }

    console.log(`✅ Registro ${id} eliminado`);
    res.json({ ok: true, message: "Registro eliminado" });
  } catch (error) {
    console.error("❌ Error DB:", error);
    res.status(500).json({ ok: false, error: "Error eliminando registro" });
  }
});

/** DELETE /api/registros — limpia TODOS los registros; solo admin */
app.delete("/api/registros", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log(`🗑️ Limpiando todos los registros — solicitado por: ${req.user.username}`);
    await pool.execute("DELETE FROM registros");
    console.log("✅ Todos los registros eliminados");
    res.json({ ok: true, message: "Registros eliminados" });
  } catch (error) {
    console.error("❌ Error DB:", error);
    res.status(500).json({ ok: false, error: "Error limpiando registros" });
  }
});

// ─── ADMIN — GESTIÓN DE USUARIOS ─────────────────────────────

/** GET /api/admin/usuarios */
app.get("/api/admin/usuarios", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, nombre, rol, activo, created_at FROM usuarios ORDER BY created_at DESC"
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error("❌ Error DB:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo usuarios" });
  }
});

/** POST /api/admin/usuarios — crear usuario */
app.post("/api/admin/usuarios", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, nombre, rol = "operador" } = req.body;

    if (!username || !password || !nombre) {
      return res.status(400).json({ ok: false, error: "username, password y nombre son requeridos" });
    }

    if (!["admin", "operador"].includes(rol)) {
      return res.status(400).json({ ok: false, error: "Rol inválido. Use 'admin' u 'operador'" });
    }

    // Verificar si ya existe
    const [existing] = await pool.execute(
      "SELECT id FROM usuarios WHERE username = ?",
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ ok: false, error: "El username ya está en uso" });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      "INSERT INTO usuarios (username, password, nombre, rol) VALUES (?, ?, ?, ?)",
      [username, hash, nombre, rol]
    );

    console.log(`✅ Usuario creado: ${username} (${rol})`);
    res.status(201).json({ ok: true, id: result.insertId, username, nombre, rol });
  } catch (error) {
    console.error("❌ Error DB:", error);
    res.status(500).json({ ok: false, error: "Error creando usuario" });
  }
});

/**
 * PATCH /api/admin/usuarios/:id — edit nombre XOR rol (design D1/API
 * Surface). `email` is not an editable field: the live schema has no such
 * column (see lib/usuariosService.js).
 */
app.patch("/api/admin/usuarios/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nombre, rol, reason } = req.body;
    const result = await updateUsuario(pool, { actor: req.user, id: req.params.id, nombre, rol, reason });
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB actualizando usuario:", error);
    res.status(500).json({ ok: false, error: "Error actualizando usuario" });
  }
});

/**
 * PATCH /api/admin/usuarios/:id/estado — deactivate/reactivate (design D5).
 * Body: { activo, reason }. Only `admin` may reactivate; distinguishes
 * `403 reactivate_forbidden` from generic `403 forbidden` (see
 * lib/usuariosService.js for why both branches are needed even though the
 * route is already `requireAdmin`-gated for other Phase 5 routes — here the
 * check happens in the service so the specific code can be returned).
 */
app.patch("/api/admin/usuarios/:id/estado", authenticateToken, async (req, res) => {
  try {
    const { activo, reason } = req.body;
    const result = await changeUsuarioEstado(pool, { actor: req.user, id: req.params.id, activo, reason });
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB actualizando estado de usuario:", error);
    res.status(500).json({ ok: false, error: "Error actualizando estado de usuario" });
  }
});

/** PATCH /api/admin/usuarios/:id/password — admin resetea/genera contraseña. Body: { password | generate, reason } */
app.patch("/api/admin/usuarios/:id/password", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { password, generate, reason } = req.body;
    const result = await resetUsuarioPassword(pool, {
      actor: req.user,
      id: req.params.id,
      password,
      generate,
      reason,
    });
    if (result.httpStatus === 200) {
      console.log(`✅ Contraseña de usuario ${req.params.id} restablecida — solicitado por: ${req.user.username}`);
    }
    res.set("Cache-Control", "no-store").status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error restableciendo contraseña:", error.message);
    res.status(500).json({ ok: false, error: "Error restableciendo contraseña" });
  }
});

/** GET /api/admin/usuarios/:id/audit — historial de auditoría del usuario */
app.get("/api/admin/usuarios/:id/audit", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await getUsuarioAuditLog(pool, req.params.id);
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB obteniendo auditoría de usuario:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo auditoría de usuario" });
  }
});

/**
 * DELETE /api/admin/usuarios/:id — self-delete guard (unchanged behavior)
 * plus the history guard (spec "Delete-Guard for Usuarios With History"):
 * `409 user_has_history` when referenced in `registros.user_id` or
 * `admin_audit_log.actor_id`, otherwise unchanged.
 */
app.delete("/api/admin/usuarios/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await deleteUsuarioGuarded(pool, req.user, req.params.id);
    if (result.httpStatus === 200) {
      console.log(`✅ Usuario ${req.params.id} eliminado`);
    }
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB:", error);
    res.status(500).json({ ok: false, error: "Error eliminando usuario" });
  }
});

// ─── ADMIN — GESTIÓN DE PROYECTOS ─────────────────────────────

/** GET /api/proyectos — cualquier usuario autenticado (lo necesita el formulario de registro) */
app.get("/api/proyectos", authenticateToken, async (req, res) => {
  try {
    const result = await listProyectos(pool);
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB obteniendo proyectos:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo proyectos" });
  }
});

/** POST /api/proyectos — admin-only, sin auditoría (mismo criterio que crear usuario) */
app.post("/api/proyectos", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await createProyecto(pool, { nombre: req.body.nombre, teamSlug: req.body.teamSlug });
    if (result.httpStatus === 201) {
      console.log(`✅ Proyecto creado: ${result.body.nombre} — solicitado por: ${req.user.username}`);
    }
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB creando proyecto:", error);
    res.status(500).json({ ok: false, error: "Error creando proyecto" });
  }
});

/** PATCH /api/proyectos/:id — admin-only, renombra y audita */
app.patch("/api/proyectos/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await renameProyecto(pool, {
      actor: req.user,
      id: req.params.id,
      nombre: req.body.nombre,
      reason: req.body.reason,
      teamSlug: req.body.teamSlug,
    });
    if (result.httpStatus === 200) {
      console.log(`✅ Proyecto ${req.params.id} renombrado a "${result.body.nombre}" — solicitado por: ${req.user.username}`);
    }
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB renombrando proyecto:", error);
    res.status(500).json({ ok: false, error: "Error renombrando proyecto" });
  }
});

/** DELETE /api/proyectos/:id — admin-only, bloqueado si tiene historial (409 proyecto_has_history) */
app.delete("/api/proyectos/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await deleteProyectoGuarded(pool, {
      actor: req.user,
      id: req.params.id,
      reason: req.body.reason,
    });
    if (result.httpStatus === 200) {
      console.log(`✅ Proyecto ${req.params.id} eliminado — solicitado por: ${req.user.username}`);
    }
    res.status(result.httpStatus).json(result.body);
  } catch (error) {
    console.error("❌ Error DB eliminando proyecto:", error);
    res.status(500).json({ ok: false, error: "Error eliminando proyecto" });
  }
});

// ─── Migración de arranque (idempotente) ─────────────────────
// El deploy solo reinicia el contenedor, así que la columna se asegura aquí.
// Equivalente a migration_password_changed_at.sql.
async function ensurePasswordChangedAtColumn() {
  const [rows] = await pool.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'password_changed_at'`
  );
  if (rows.length === 0) {
    await pool.execute("ALTER TABLE usuarios ADD COLUMN password_changed_at DATETIME NULL");
    console.log("✅ Migración: columna usuarios.password_changed_at creada");
  }
}

// ─── Servidor ─────────────────────────────────────────────────
const PORT = 3001;
try {
  await ensurePasswordChangedAtColumn();
} catch (error) {
  console.error("FATAL: no se pudo asegurar usuarios.password_changed_at:", error.message);
  process.exit(1);
}
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API escuchando en puerto ${PORT}`);
  console.log(`📊 DB_HOST: ${process.env.DB_HOST}`);
  console.log(`📊 DB_NAME: ${process.env.DB_NAME}`);
});
