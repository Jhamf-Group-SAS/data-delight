import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRegistrosFilters } from "@/hooks/useRegistrosFilters";
import { RegistrosFilterBar } from "@/components/admin/RegistrosFilterBar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ChangeOwnPasswordButton } from "@/components/ChangeOwnPasswordDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";

/**
 * `/admin/registros` — filter/list surface for the "Role-Scoped Registro
 * Search, Filter, and Detail" requirement. Admin-only (see `AdminRoute` in
 * App.tsx); `operador`'s own-scope view remains the existing `/dashboard`
 * (Index.tsx), unmodified by this change. Query key `['registros', filters]`
 * per design's Frontend section.
 */
const AdminRegistros = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useRegistrosFilters();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["registros", filters],
    queryFn: () => api.listRegistrosAdmin(filters),
  });

  const rows = data?.ok ? data.data : [];
  const pagination = data?.pagination;

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-header py-8 px-4">
        <div className="container mx-auto flex items-center gap-3">
          <div className="p-3 bg-primary-foreground/20 rounded-xl">
            <ListFilter className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-primary-foreground">
              Registros — Búsqueda y Corrección
            </h1>
            <p className="text-primary-foreground/80">Filtrado y corrección auditada de estado</p>
          </div>
          <ChangeOwnPasswordButton />
          <button
            onClick={() => navigate("/admin/usuarios")}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">Usuarios</span>
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col gap-6">
        <Card className="card-shadow border-0">
          <CardContent className="p-6">
            <RegistrosFilterBar filters={filters} onFilterChange={setFilters} />
          </CardContent>
        </Card>

        <Card className="card-shadow border-0">
          <CardHeader className="gradient-header rounded-t-xl">
            <CardTitle className="text-primary-foreground">
              Registros {pagination ? `(${pagination.total})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                <span className="text-muted-foreground">Cargando registros...</span>
              </div>
            ) : isError ? (
              <p className="p-8 text-center text-destructive">Error al cargar registros.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Cédula</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Centro de operación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay registros que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id_registro}>
                        <TableCell className="font-medium">{r.nombre}</TableCell>
                        <TableCell>{r.cedula}</TableCell>
                        <TableCell>{r.proyecto}</TableCell>
                        <TableCell>{r.centro_operacion}</TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/registros/${r.id_registro}`)}
                          >
                            Ver detalle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => setFilters({ page: pagination.page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setFilters({ page: pagination.page + 1 })}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminRegistros;
