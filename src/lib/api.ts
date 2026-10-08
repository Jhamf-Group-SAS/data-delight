import { Employee, AdminUser, Pagination, Proyecto } from "@/types/employee";
import { AuditLogRow, RegistroFilters, RegistroRow } from "@/types/admin";

// ─── URL del API ──────────────────────────────────────────────
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:3001";
  }
  return `http://${window.location.hostname}:3001`;
};

const API_URL = getApiUrl();
console.log("🔗 API URL configurada:", API_URL);

// ─── Token helpers ────────────────────────────────────────────
const getToken = () => localStorage.getItem("token");

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

const SESSION_KEYS = ["token", "username", "userRol", "userId", "userNombre", "pending_employee_data"];

/** Removes every session key (same set the dashboard logout clears). */
export const clearSession = () => {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
};

/**
 * `fetch` for authenticated calls. A 401 means the session is gone (expired,
 * invalidated by a password change, or the user was deactivated), so clear it
 * and send the user back to the login page. The login call uses plain `fetch`
 * because its own 401 (bad credentials) must reach the form.
 */
const apiFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, init);
  if (response.status === 401) {
    clearSession();
    if (window.location.pathname !== "/") window.location.href = "/";
  }
  return response;
};

// ─── API ──────────────────────────────────────────────────────
export const api = {
  // ── Auth ────────────────────────────────────────────────────
  async login(username: string, password: string): Promise<{ ok: boolean; token?: string; user?: { id: number; username: string; nombre: string; rol: string }; error?: string }> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.json();
  },

  async getMe(): Promise<{ ok: boolean; user?: { id: number; username: string; nombre: string; rol: string } }> {
    const response = await apiFetch(`${API_URL}/api/auth/me`, {
      headers: authHeaders(),
    });
    return response.json();
  },

  /** Self-service password change. Stores the fresh token the server returns. */
  async changeOwnPassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/auth/change-password`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (json.ok && json.token) localStorage.setItem("token", json.token);
    return { ok: Boolean(json.ok), error: json.error };
  },

  // ── Registros ────────────────────────────────────────────────
  async getRegistros(page = 1, limit = 10): Promise<{ data: Employee[]; pagination: Pagination }> {
    try {
      const response = await apiFetch(
        `${API_URL}/api/registros?page=${page}&limit=${limit}`,
        { headers: authHeaders() }
      );
      const json = await response.json();
      return {
        data: json.ok ? json.data : [],
        pagination: json.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
    } catch (error) {
      console.error("Error obteniendo registros:", error);
      return { data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } };
    }
  },

  async getAllRegistros(): Promise<Employee[]> {
    try {
      const response = await apiFetch(`${API_URL}/api/registros?all=true`, {
        headers: authHeaders(),
      });
      const json = await response.json();
      if (!json.ok) return [];
      return json.data.map((item: any) => ({
        id:              String(item.id_registro || item.id),
        proyecto:        item.proyecto         || "",
        centroOperacion: item.centro_operacion || "",
        cargo:           item.cargo            || "",
        cedula:          item.cedula           || "",
        nombre:          item.nombre           || "",
        numero:          item.numero           || "",
        status:          item.status           || "NO",
        createdAt:       item.created_at,
        usuarioNombre:   item.usuario_nombre,
      }));
    } catch (error) {
      console.error("Error obteniendo todos los registros:", error);
      return [];
    }
  },

  // ── Admin — registros (Phase 6: /admin/registros) ─────────────
  /**
   * `GET /api/registros` with the full filter set (design "Frontend" /
   * spec "Role-Scoped Registro Search, Filter, and Detail"). Kept separate
   * from `getRegistros`/`getAllRegistros` above (which the existing
   * `/dashboard` page still uses unmodified) because the admin filter page
   * needs the raw row shape (`RegistroRow`), not the camelCase `Employee`
   * mapping those two already do for their own callers.
   */
  async listRegistrosAdmin(
    filters: RegistroFilters
  ): Promise<{ ok: boolean; data: RegistroRow[]; pagination: Pagination }> {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    if (filters.proyecto) params.set("proyecto", filters.proyecto);
    if (filters.centro_operacion) params.set("centro_operacion", filters.centro_operacion);
    if (filters.user_id) params.set("user_id", filters.user_id);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));

    const response = await apiFetch(`${API_URL}/api/registros?${params.toString()}`, {
      headers: authHeaders(),
    });
    return response.json();
  },

  async getRegistroDetail(
    id: string | number
  ): Promise<{ ok: boolean; data?: RegistroRow; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/registros/${id}`, {
      headers: authHeaders(),
    });
    return response.json();
  },

  async changeRegistroStatus(
    id: string | number,
    payload: { fromStatus: string; toStatus: string; reason: string }
  ): Promise<{ ok: boolean; status?: string; auditId?: number; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/registros/${id}/status`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  async getRegistroAudit(
    id: string | number
  ): Promise<{ ok: boolean; data: AuditLogRow[] }> {
    const response = await apiFetch(`${API_URL}/api/registros/${id}/audit`, {
      headers: authHeaders(),
    });
    return response.json();
  },

  async saveRegistro(empleado: Omit<Employee, "id" | "createdAt" | "usuarioNombre">): Promise<{ ok: boolean; id_registro?: number }> {
    try {
      const response = await apiFetch(`${API_URL}/api/registros`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          proyecto:         empleado.proyecto,
          centro_operacion: empleado.centroOperacion,
          cargo:            empleado.cargo,
          cedula:           empleado.cedula,
          nombre:           empleado.nombre,
          numero:           empleado.numero,
          // status NO se envía — el servidor lo fuerza a "NO"
        }),
      });
      return response.json();
    } catch (error) {
      console.error("Error guardando registro:", error);
      return { ok: false };
    }
  },

  async saveMultipleRegistros(empleados: Omit<Employee, "id" | "createdAt" | "usuarioNombre">[]): Promise<{ ok: boolean; saved: number }> {
    let saved = 0;
    for (const empleado of empleados) {
      try {
        const result = await this.saveRegistro(empleado);
        if (result.ok) saved++;
      } catch (error) {
        console.error("Error guardando registro:", error);
      }
    }
    return { ok: true, saved };
  },

  async deleteRegistro(id: number): Promise<{ ok: boolean }> {
    try {
      const response = await apiFetch(`${API_URL}/api/registros/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      return response.json();
    } catch (error) {
      console.error("Error eliminando registro:", error);
      return { ok: false };
    }
  },

  async clearRegistros(): Promise<{ ok: boolean }> {
    try {
      const response = await apiFetch(`${API_URL}/api/registros`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      return response.json();
    } catch (error) {
      console.error("Error limpiando registros:", error);
      return { ok: false };
    }
  },

  // ── Admin — usuarios ─────────────────────────────────────────
  async getUsuarios(): Promise<AdminUser[]> {
    try {
      const response = await apiFetch(`${API_URL}/api/admin/usuarios`, {
        headers: authHeaders(),
      });
      const json = await response.json();
      return json.ok ? json.data : [];
    } catch (error) {
      console.error("Error obteniendo usuarios:", error);
      return [];
    }
  },

  async createUsuario(data: { username: string; password: string; nombre: string; rol: string }): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await apiFetch(`${API_URL}/api/admin/usuarios`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      return response.json();
    } catch (error) {
      console.error("Error creando usuario:", error);
      return { ok: false, error: "Error de conexión" };
    }
  },

  // Delete kept in the API client because the backend guard still exists
  // (`DELETE /api/admin/usuarios/:id`, `409 user_has_history`), but Phase 6
  // deliberately does not expose it as a UI action (proposal's "no
  // hard-delete exposed" intent) — no caller of this method remains after
  // this change; left for a future explicit re-exposure decision.
  async deleteUsuario(id: number): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await apiFetch(`${API_URL}/api/admin/usuarios/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      return response.json();
    } catch (error) {
      console.error("Error eliminando usuario:", error);
      return { ok: false, error: "Error de conexión" };
    }
  },

  // ── Admin — usuarios edit/estado/audit (Phase 6) ───────────────
  async updateUsuarioAdmin(
    id: number,
    payload: { nombre?: string; rol?: string; reason: string }
  ): Promise<{ ok: boolean; auditId?: number; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/admin/usuarios/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  async changeUsuarioEstadoAdmin(
    id: number,
    payload: { activo: boolean; reason: string }
  ): Promise<{ ok: boolean; activo?: boolean; auditId?: number; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/admin/usuarios/${id}/estado`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  async resetUsuarioPasswordAdmin(
    id: number,
    payload: { password?: string; generate?: boolean; reason: string }
  ): Promise<{ ok: boolean; password?: string; auditId?: number; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/admin/usuarios/${id}/password`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return response.json();
  },

  async getUsuarioAudit(id: number): Promise<{ ok: boolean; data: AuditLogRow[] }> {
    const response = await apiFetch(`${API_URL}/api/admin/usuarios/${id}/audit`, {
      headers: authHeaders(),
    });
    return response.json();
  },

  // ── Admin — proyectos ─────────────────────────────────────────
  async getProyectos(): Promise<Proyecto[]> {
    try {
      const response = await apiFetch(`${API_URL}/api/proyectos`, {
        headers: authHeaders(),
      });
      const json = await response.json();
      return json.ok ? json.data : [];
    } catch (error) {
      console.error("Error obteniendo proyectos:", error);
      return [];
    }
  },

  async createProyecto(
    nombre: string,
    teamSlug: string
  ): Promise<{ ok: boolean; id?: number; nombre?: string; teamSlug?: string; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/proyectos`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ nombre, teamSlug }),
    });
    return response.json();
  },

  async renameProyecto(
    id: number,
    data: { nombre: string; reason: string; teamSlug: string }
  ): Promise<{ ok: boolean; nombre?: string; teamSlug?: string; auditId?: number; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/proyectos/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteProyecto(id: number, data: { reason: string }): Promise<{ ok: boolean; error?: string }> {
    const response = await apiFetch(`${API_URL}/api/proyectos/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return response.json();
  },
};
