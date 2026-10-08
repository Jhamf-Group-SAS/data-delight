import { Navigate } from "react-router-dom";
import { isAuthenticated, isAdminSession } from "@/lib/session";

/**
 * src/components/routeGuards.tsx — extracted from App.tsx (sdd-verify
 * CRITICAL-1 fix) so the guard logic is directly unit-testable and so
 * `/admin/registros`/`/admin/registros/:id` can use a role-aware guard
 * (`AuthenticatedRoute`) instead of the admin-only `AdminRoute`.
 *
 * The backend already correctly scopes what each role can see/do
 * (lib/accessScope.js) — an operador hitting these routes only ever sees
 * their own registros, enforced server-side. `AuthenticatedRoute` only
 * proves a valid session exists; it intentionally does not check role.
 */

/** Verifica que haya un token JWT válido (existencia, no expiración) */
export { isAuthenticated };
export const isAdmin = isAdminSession;

/** Protege rutas que requieren login, sin importar el rol (admin u operador). */
export const AuthenticatedRoute = ({ children }: { children: React.ReactNode }) => {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/** Protege rutas que requieren rol admin */
export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  if (!isAuthenticated()) return <Navigate to="/" replace />;
  if (!isAdmin()) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};
