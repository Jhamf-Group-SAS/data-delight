import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Employee, EmployeeFormData, Pagination } from "@/types/employee";
import EmployeeForm from "@/components/EmployeeForm";
import ExcelUploader from "@/components/ExcelUploader";
import DataTable from "@/components/DataTable";
import { toast } from "sonner";
import { ChangeOwnPasswordButton } from "@/components/ChangeOwnPasswordDialog";
import { api } from "@/lib/api";
import { LogoutButton } from "@/components/LogoutButton";
import { getSessionItem, setSessionItem, removeSessionItem } from "@/lib/session";
import { Users, ListFilter, FolderKanban } from "lucide-react";

// Cache temporal de registros pendientes (aún no enviados a BD)
const PENDING_KEY = "pending_employee_data" as const;

const Index = () => {
  const navigate  = useNavigate();
  const userRol   = getSessionItem("userRol") || "operador";
  const userNombre = getSessionItem("userNombre") || "";

  // Registros persistidos en BD (historial)
  const [savedEmployees, setSavedEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 10, totalPages: 0 });

  // Registros pendientes (solo en UI, aún no en BD)
  const [pendingEmployees, setPendingEmployees] = useState<Employee[]>(() => {
    try {
      const saved = getSessionItem(PENDING_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);

  const generateId = () => Math.random().toString(36).substring(2, 11);

  // Persistir pendientes en sessionStorage (por pestaña)
  useEffect(() => {
    if (pendingEmployees.length > 0) {
      setSessionItem(PENDING_KEY, JSON.stringify(pendingEmployees));
    } else {
      removeSessionItem(PENDING_KEY);
    }
  }, [pendingEmployees]);

  // ── Cargar historial desde BD ────────────────────────────────
  const loadSavedEmployees = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const { data, pagination: pag } = await api.getRegistros(page, 10);

      const mapped: Employee[] = data.map((item: any) => ({
        id:              String(item.id_registro),
        proyecto:        item.proyecto        || "",
        centroOperacion: item.centro_operacion || "",
        cargo:           item.cargo           || "",
        cedula:          item.cedula          || "",
        nombre:          item.nombre          || "",
        numero:          item.numero          || "",
        status:          item.status          || "NO",
        createdAt:       item.created_at,
        usuarioNombre:   item.usuario_nombre,
      }));

      setSavedEmployees(mapped);
      setPagination(pag);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar registros de la base de datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedEmployees(1);
  }, [loadSavedEmployees]);

  // ── Formulario individual (solo UI) ─────────────────────────
  const handleAddEmployee = (data: EmployeeFormData) => {
    const tempEmployee: Employee = { ...data, id: generateId() };
    setPendingEmployees((prev) => [...prev, tempEmployee]);
    toast.success("Registro agregado a la tabla de pendientes");
  };

  // ── Carga masiva Excel (solo UI) ─────────────────────────────
  const handleBulkUpload = (data: EmployeeFormData[]) => {
    const temps: Employee[] = data.map((item) => ({ ...item, id: generateId() }));
    setPendingEmployees((prev) => [...prev, ...temps]);
    toast.success(`${data.length} registros cargados en pendientes`);
  };

  // ── Eliminar pendiente (no está en BD) ───────────────────────
  const handleDeletePending = (id: string) => {
    setPendingEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  // ── Eliminar registro de BD ──────────────────────────────────
  const handleDeleteSaved = async (id: string) => {
    setSavedEmployees((prev) => prev.filter((e) => e.id !== id));
    try {
      setLoading(true);
      if (!isNaN(Number(id))) {
        await api.deleteRegistro(Number(id));
        toast.success("Registro eliminado de la base de datos");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar el registro");
      await loadSavedEmployees(pagination.page); // revertir
    } finally {
      setLoading(false);
    }
  };

  // ── Iniciar Proceso — enviar pendientes a BD ─────────────────
  const handleStartProcess = async (data: Employee[]) => {
    if (data.length === 0) {
      toast.error("No hay registros para procesar");
      return;
    }

    try {
      setLoading(true);
      toast.info(`Enviando ${data.length} registros a la base de datos...`);

      const payload = data.map(({ id, createdAt, usuarioNombre, ...rest }) => rest);
      const result  = await api.saveMultipleRegistros(payload);

      toast.success(`${result.saved} registros guardados correctamente`);
      setPendingEmployees([]);                // limpiar pendientes
      await loadSavedEmployees(1);            // refrescar historial
    } catch (error) {
      console.error(error);
      toast.error("Error al iniciar el proceso");
    } finally {
      setLoading(false);
    }
  };

  // ── Limpiar todos los registros de BD ───────────────────────
  const handleClear = async () => {
    if (!confirm("¿Está seguro de eliminar TODOS los registros?")) return;
    try {
      setLoading(true);
      await api.clearRegistros();
      setSavedEmployees([]);
      toast.success("Todos los registros fueron eliminados");
    } catch (error) {
      console.error(error);
      toast.error("Error al limpiar los registros");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-header py-8 px-4">
        <div className="container mx-auto flex items-center gap-3">
          <div className="p-3 bg-primary-foreground/20 rounded-xl">
            <img src="/r.png" alt="Regency Logo" className="h-8 w-8 object-contain" />
          </div>

          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-primary-foreground">
              Gestión de Datos Regency
            </h1>
            <p className="text-primary-foreground/80">
              {userNombre} · {userRol === "admin" ? "Administrador" : "Operador"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Registros — visible para admin y operador, misma pantalla que AuthenticatedRoute admite */}
            <button
              onClick={() => navigate("/admin/registros")}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
            >
              <ListFilter className="h-4 w-4" />
              <span className="hidden md:inline">Registros</span>
            </button>

            {/* Panel Admin — solo visible para admins */}
            {userRol === "admin" && (
              <button
                onClick={() => navigate("/admin/usuarios")}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
              >
                <Users className="h-4 w-4" />
                <span className="hidden md:inline">Usuarios</span>
              </button>
            )}

            {/* Catálogo de proyectos — solo visible para admins */}
            {userRol === "admin" && (
              <button
                onClick={() => navigate("/admin/proyectos")}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
              >
                <FolderKanban className="h-4 w-4" />
                <span className="hidden md:inline">Proyectos</span>
              </button>
            )}

            <ChangeOwnPasswordButton />

            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            <span className="text-blue-600 font-medium">Procesando...</span>
          </div>
        )}

        {/* Formulario y cargador Excel — para registros PENDIENTES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EmployeeForm onSubmit={handleAddEmployee} />
          <ExcelUploader onUpload={handleBulkUpload} />
        </div>

        {/* Tabla de PENDIENTES (pre-envío) */}
        {pendingEmployees.length > 0 && (
          <DataTable
            data={pendingEmployees}
            mode="pending"
            onDelete={handleDeletePending}
            onClear={() => setPendingEmployees([])}
            onStartProcess={handleStartProcess}
            showUserColumn={false}
          />
        )}

        {/* Historial — registros ya enviados a BD */}
        <DataTable
          data={savedEmployees}
          mode="saved"
          onDelete={handleDeleteSaved}
          onClear={handleClear}
          onStartProcess={async () => {}}
          pagination={pagination}
          onPageChange={loadSavedEmployees}
          showUserColumn={userRol === "admin"}
          canDelete={userRol === "admin"}
        />
      </main>

      <footer className="py-6 border-t border-border text-center text-sm text-muted-foreground">
        Sistema de Gestión de Datos Regency • {new Date().getFullYear()} • MySQL
      </footer>
    </div>
  );
};

export default Index;
