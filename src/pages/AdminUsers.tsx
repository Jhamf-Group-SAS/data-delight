import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminUser } from "@/types/employee";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ChangeOwnPasswordButton } from "@/components/ChangeOwnPasswordDialog";
import { UsuarioPasswordDialog } from "@/components/admin/UsuarioPasswordDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UsuarioEditDialog } from "@/components/admin/UsuarioEditDialog";
import { UsuarioEstadoDialog } from "@/components/admin/UsuarioEstadoDialog";
import { UsuarioAuditDialog } from "@/components/admin/UsuarioAuditDialog";
import { LogoutButton } from "@/components/LogoutButton";
import { clearSession, getSessionItem } from "@/lib/session";
import { userErrorMessage } from "@/lib/userErrors";
import { UserPlus, ArrowLeft, Shield, Users, Pencil, Power, History, ListFilter, FolderKanban, KeyRound } from "lucide-react";

const AdminUsers = () => {
  const navigate   = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget]     = useState<AdminUser | null>(null);
  const [estadoTarget, setEstadoTarget] = useState<AdminUser | null>(null);
  const [auditTarget, setAuditTarget]   = useState<AdminUser | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);

  // Formulario de creación
  const [form, setForm] = useState({
    username: "",
    password: "",
    nombre:   "",
    rol:      "operador",
  });
  const [formLoading, setFormLoading] = useState(false);

  const currentUserId = Number(getSessionItem("userId"));
  // Protected accounts can only be modified by themselves.
  const isLocked = (u: AdminUser) => u.protegido === true && u.id !== currentUserId;

  const usuariosQuery = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => api.getUsuarios(),
  });
  const usuarios = usuariosQuery.data ?? [];
  const loading = usuariosQuery.isLoading;

  const invalidateUsuario = (id: number) => {
    queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    queryClient.invalidateQueries({ queryKey: ["audit", "usuario", String(id)] });
  };

  const editNombreMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { nombre: string; reason: string } }) =>
      api.updateUsuarioAdmin(id, payload),
    onSuccess: (result, { id }) => {
      if (!result.ok) {
        toast.error(userErrorMessage(result.error, "No se pudo actualizar el nombre"));
        return;
      }
      toast.success("Nombre actualizado y auditado");
      invalidateUsuario(id);
    },
    onError: () => toast.error("Error de conexión"),
  });

  const editRolMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { rol: string; reason: string } }) =>
      api.updateUsuarioAdmin(id, payload),
    onSuccess: (result, { id }) => {
      if (!result.ok) {
        toast.error(userErrorMessage(result.error, "No se pudo actualizar el rol"));
        return;
      }
      toast.success("Rol actualizado y auditado");
      invalidateUsuario(id);
    },
    onError: () => toast.error("Error de conexión"),
  });

  const estadoMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { activo: boolean; reason: string } }) =>
      api.changeUsuarioEstadoAdmin(id, payload),
    onSuccess: (result, { id }) => {
      if (!result.ok) {
        toast.error(userErrorMessage(result.error, "No se pudo actualizar el estado"));
        return;
      }
      toast.success("Estado actualizado y auditado");
      setEstadoTarget(null);
      invalidateUsuario(id);
    },
    onError: () => toast.error("Error de conexión"),
  });

  // The dialog shows the generated/typed password once and handles its own
  // error text, so this returns the raw result instead of toasting.
  const handlePasswordConfirm = async (
    id: number,
    payload: { password?: string; generate?: boolean; reason: string }
  ) => {
    const result = await api.resetUsuarioPasswordAdmin(id, payload);
    // A self-reset already invalidated our token: refetching now would 401 and
    // redirect to login before the one-time password is shown.
    if (result.ok && id !== currentUserId) invalidateUsuario(id);
    return result;
  };

  // Resetting your own password invalidates your token (server-side).
  const handleSelfSessionClosed = () => {
    clearSession();
    window.location.href = "/";
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.username.trim() || !form.password.trim() || !form.nombre.trim()) {
      toast.error("Todos los campos son requeridos");
      return;
    }

    if (form.password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    try {
      setFormLoading(true);
      const result = await api.createUsuario(form);

      if (result.ok) {
        toast.success(`Usuario "${form.username}" creado exitosamente`);
        setShowCreateModal(false);
        setForm({ username: "", password: "", nombre: "", rol: "operador" });
        queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      } else {
        toast.error(result.error || "Error al crear el usuario");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setFormLoading(false);
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
              Panel de Administración
            </h1>
            <p className="text-primary-foreground/80">Gestión de usuarios del sistema</p>
          </div>
          <ChangeOwnPasswordButton />
          <button
            onClick={() => navigate("/admin/registros")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
          >
            <ListFilter className="h-4 w-4" />
            <span className="hidden md:inline">Registros</span>
          </button>
          <button
            onClick={() => navigate("/admin/proyectos")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
          >
            <FolderKanban className="h-4 w-4" />
            <span className="hidden md:inline">Proyectos</span>
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">Volver</span>
          </button>
          <LogoutButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="card-shadow border-0">
          <CardHeader className="gradient-header rounded-t-xl">
            <div className="flex items-center justify-between">
              <CardTitle className="flex gap-2 text-primary-foreground">
                <Users className="h-5 w-5" />
                Usuarios ({usuarios.length})
              </CardTitle>
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Nuevo Usuario
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                <span className="text-muted-foreground">Cargando usuarios...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay usuarios registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuarios.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.nombre}</TableCell>
                        <TableCell className="text-muted-foreground">@{u.username}</TableCell>
                        <TableCell>
                          <Badge
                            variant={u.rol === "admin" ? "default" : "secondary"}
                            className="gap-1"
                          >
                            {u.rol === "admin" && <Shield className="h-3 w-3" />}
                            {u.rol}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.activo ? "default" : "destructive"}>
                            {u.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("es-CO")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={isLocked(u)}
                              title={isLocked(u) ? "Usuario protegido" : "Editar usuario"}
                              onClick={() => setEditTarget(u)}
                              className="disabled:opacity-30"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={u.id === currentUserId || isLocked(u)}
                              title={
                                u.id === currentUserId
                                  ? "No podés desactivarte a vos mismo"
                                  : isLocked(u)
                                    ? "Usuario protegido"
                                    : u.activo
                                    ? "Desactivar usuario"
                                    : "Reactivar usuario"
                              }
                              onClick={() => setEstadoTarget(u)}
                              className="disabled:opacity-30"
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={isLocked(u)}
                              title={isLocked(u) ? "Usuario protegido" : "Cambiar contraseña"}
                              onClick={() => setPasswordTarget(u)}
                              className="disabled:opacity-30"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Ver auditoría"
                              onClick={() => setAuditTarget(u)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Modal — Crear usuario */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Crear Nuevo Usuario
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="new-nombre">Nombre completo *</Label>
                <Input
                  id="new-nombre"
                  placeholder="Ej: María García"
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-username">Username *</Label>
                <Input
                  id="new-username"
                  placeholder="Ej: mgarcia"
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-password">Contraseña * (mín. 8 caracteres)</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-rol">Rol *</Label>
                <Select
                  value={form.rol}
                  onValueChange={(val) => setForm((p) => ({ ...p, rol: val }))}
                >
                  <SelectTrigger id="new-rol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={formLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={formLoading} className="gradient-primary text-white">
                {formLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Creando...
                  </div>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear Usuario
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Editar usuario — nombre XOR rol, un campo por guardado (ver
          UsuarioEditDialog — admin_audit_log es una fila por campo) */}
      {editTarget && (
        <UsuarioEditDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          usuario={editTarget}
          isSubmittingNombre={editNombreMutation.isPending}
          isSubmittingRol={editRolMutation.isPending}
          onSaveNombre={(id, payload) => editNombreMutation.mutate({ id, payload })}
          onSaveRol={(id, payload) => editRolMutation.mutate({ id, payload })}
        />
      )}

      {/* Activar/desactivar — reemplaza la acción de eliminar; el DELETE
          guardado en el backend (409 user_has_history) ya no se expone en
          la UI (intención del proposal: "no hard-delete exposed"). */}
      {estadoTarget && (
        <UsuarioEstadoDialog
          open={!!estadoTarget}
          onOpenChange={(open) => !open && setEstadoTarget(null)}
          usuario={estadoTarget}
          isSubmitting={estadoMutation.isPending}
          onConfirm={(id, payload) => estadoMutation.mutate({ id, payload })}
        />
      )}

      {/* Cambiar contraseña — muestra la nueva contraseña una sola vez */}
      {passwordTarget && (
        <UsuarioPasswordDialog
          open={!!passwordTarget}
          onOpenChange={(open) => !open && setPasswordTarget(null)}
          usuario={passwordTarget}
          isCurrentUser={passwordTarget.id === currentUserId}
          onConfirm={handlePasswordConfirm}
          onSelfSessionClosed={handleSelfSessionClosed}
        />
      )}

      {/* Auditoría del usuario (sdd-verify CRITICAL-2 fix): reutiliza
          AuditTimeline, ya construido para la auditoría de registros, para
          renderizar el historial de admin_audit_log de este usuario. */}
      <UsuarioAuditDialog
        open={!!auditTarget}
        onOpenChange={(open) => !open && setAuditTarget(null)}
        usuario={auditTarget}
      />
    </div>
  );
};

export default AdminUsers;
