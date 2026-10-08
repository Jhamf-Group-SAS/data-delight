import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatusCorrectionDialog } from "@/components/admin/StatusCorrectionDialog";
import { AuditTimeline } from "@/components/admin/AuditTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * `/admin/registros/:id` — detail + audited status-correction dialog +
 * audit timeline (spec "Audited Status Correction"). Query keys
 * `['registro', id]` / `['audit', 'registro', id]` — `'registro'` is the
 * exact `entity` value `lib/registrosService.js` writes to `admin_audit_log`
 * (confirmed by reading it, not design.md's generic `entity` placeholder).
 */
const AdminRegistroDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const registroQuery = useQuery({
    queryKey: ["registro", id],
    queryFn: () => api.getRegistroDetail(id!),
    enabled: !!id,
  });

  const auditQuery = useQuery({
    queryKey: ["audit", "registro", id],
    queryFn: () => api.getRegistroAudit(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { toStatus: string; reason: string }) =>
      api.changeRegistroStatus(id!, {
        fromStatus: registro?.status ?? "",
        toStatus: payload.toStatus,
        reason: payload.reason,
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error || "No se pudo corregir el estado");
        return;
      }
      toast.success("Estado corregido y auditado");
      setCorrectionOpen(false);
      queryClient.invalidateQueries({ queryKey: ["registro", id] });
      queryClient.invalidateQueries({ queryKey: ["audit", "registro", id] });
      queryClient.invalidateQueries({ queryKey: ["registros"] });
    },
    onError: () => toast.error("Error de conexión al corregir el estado"),
  });

  const registro = registroQuery.data?.ok ? registroQuery.data.data : undefined;
  const auditEntries = auditQuery.data?.ok ? auditQuery.data.data : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-header py-8 px-4">
        <div className="container mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/registros")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">Volver</span>
          </button>
          <h1 className="flex-1 text-2xl md:text-3xl font-bold text-primary-foreground">
            Detalle de registro {id}
          </h1>
          <LogoutButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col gap-6">
        {registroQuery.isLoading ? (
          <p className="text-center text-muted-foreground py-8">Cargando...</p>
        ) : !registro ? (
          <p className="text-center text-destructive py-8">
            {registroQuery.data && !registroQuery.data.ok
              ? registroQuery.data.error === "forbidden"
                ? "No tenés acceso a este registro."
                : "Registro no encontrado."
              : "Error al cargar el registro."}
          </p>
        ) : (
          <>
            <Card className="card-shadow border-0">
              <CardHeader className="gradient-header rounded-t-xl">
                <CardTitle className="flex items-center justify-between text-primary-foreground">
                  <span>{registro.nombre}</span>
                  <StatusBadge status={registro.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Cédula: </span>
                  {registro.cedula}
                </div>
                <div>
                  <span className="text-muted-foreground">Proyecto: </span>
                  {registro.proyecto}
                </div>
                <div>
                  <span className="text-muted-foreground">Centro de operación: </span>
                  {registro.centro_operacion}
                </div>
                <div>
                  <span className="text-muted-foreground">Cargo: </span>
                  {registro.cargo}
                </div>
                {registro.usuario_nombre && (
                  <div>
                    <span className="text-muted-foreground">Cargado por: </span>
                    {registro.usuario_nombre}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Button size="sm" onClick={() => setCorrectionOpen(true)}>
                    Corregir estado
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="card-shadow border-0">
              <CardHeader>
                <CardTitle>Auditoría</CardTitle>
              </CardHeader>
              <CardContent>
                <AuditTimeline entries={auditEntries} />
              </CardContent>
            </Card>

            <StatusCorrectionDialog
              open={correctionOpen}
              onOpenChange={setCorrectionOpen}
              currentStatus={registro.status}
              isSubmitting={statusMutation.isPending}
              onConfirm={(toStatus, reason) => statusMutation.mutate({ toStatus, reason })}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default AdminRegistroDetail;
