import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { isAdminSession } from "@/lib/session";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

const ERROR_MESSAGES: Record<string, string> = {
  current_password_required: "Ingrese su contraseña actual",
  invalid_current_password: "La contraseña actual no es correcta",
  password_too_short: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
  password_too_long: "La nueva contraseña es demasiado larga (máximo 72 bytes)",
  password_unchanged: "La nueva contraseña debe ser distinta de la actual",
};

interface ChangeOwnPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Self-service password change, available to every authenticated role. */
export function ChangeOwnPasswordDialog({ open, onOpenChange }: ChangeOwnPasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsSubmitting(false);
      setError(null);
    }
  }, [open]);

  const tooShort = newPassword !== "" && newPassword.length < MIN_PASSWORD_LENGTH;
  const tooLong = new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES;
  const mismatch = confirmPassword !== "" && newPassword !== confirmPassword;
  const unchanged = newPassword !== "" && newPassword === currentPassword;
  const canSubmit =
    currentPassword !== "" &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    !tooLong &&
    newPassword === confirmPassword &&
    !unchanged &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await api.changeOwnPassword({ currentPassword, newPassword });
      if (result.ok) {
        toast.success("Contraseña actualizada");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onOpenChange(false);
      } else {
        setError(
          (result.error && ERROR_MESSAGES[result.error]) || "No se pudo cambiar la contraseña"
        );
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>
            Ingrese su contraseña actual y elija una nueva de al menos {MIN_PASSWORD_LENGTH}{" "}
            caracteres.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="own-current-password">Contraseña actual</Label>
              <Input
                id="own-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="own-new-password">Nueva contraseña</Label>
              <Input
                id="own-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {tooShort && (
                <p className="text-xs text-destructive">{ERROR_MESSAGES.password_too_short}</p>
              )}
              {tooLong && (
                <p className="text-xs text-destructive">{ERROR_MESSAGES.password_too_long}</p>
              )}
              {unchanged && (
                <p className="text-xs text-destructive">{ERROR_MESSAGES.password_unchanged}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="own-confirm-password">Confirmar nueva contraseña</Label>
              <Input
                id="own-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {mismatch && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Cambiar contraseña
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Header button + dialog, for dropping next to the logout/nav buttons. */
export function ChangeOwnPasswordButton() {
  const [open, setOpen] = useState(false);
  // Only admins manage credentials (the endpoint is admin-only too).
  if (!isAdminSession()) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
      >
        <KeyRound className="h-4 w-4" />
        <span className="hidden md:inline">Cambiar mi contraseña</span>
      </button>
      <ChangeOwnPasswordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
