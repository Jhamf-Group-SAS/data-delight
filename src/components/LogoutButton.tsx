import { LogOut } from "lucide-react";
import { clearSession } from "@/lib/session";

/** Header button: ends this tab's session and returns to the login page. */
export function LogoutButton() {
  const handleLogout = () => {
    clearSession();
    window.location.href = "/";
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden md:inline">Cerrar sesión</span>
    </button>
  );
}
