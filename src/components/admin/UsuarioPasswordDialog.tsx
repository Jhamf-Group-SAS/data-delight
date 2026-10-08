import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminUser } from "@/types/employee";
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
import { Textarea } from "@/components/ui/textarea";
import { Eye, EyeOff, Copy } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignores bytes past 72; the backend rejects instead of truncating.
const MAX_PASSWORD_BYTES = 72;

export interface ResetPasswordPayload {
  password?: string;
  generate?: boolean;
  reason: string;
}

export interface ResetPasswordResult {
  ok: boolean;
  password?: string;
  error?: string;
}

interface UsuarioPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: AdminUser;
  /** Resolves with the backend result; the dialog shows the new password once. */
  onConfirm: (id: number, payload: ResetPasswordPayload) => Promise<ResetPasswordResult>;
  /** True when the target is the logged-in admin (their own token gets invalidated). */
  isCurrentUser?: boolean;
  /** Called after "Listo" when `isCurrentUser`, so the page can end the session. */
  onSelfSessionClosed?: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  reason_required: "El motivo es obligatorio",
  password_too_short: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
  password_too_long: "La contraseña es demasiado larga (máximo 72 bytes)",
  not_found: "El usuario no existe",
  forbidden: "No tiene permisos para realizar esta acción",
};

const passwordErrorMessage = (code: string | undefined, fallback: string) =>
  (code && ERROR_MESSAGES[code]) || fallback;

/**
 * Admin password reset for `/admin/usuarios`. Passwords are one-way hashes, so
 * the "visibility" the admin gets is the NEW password, shown exactly once in
 * the result view. Closing the dialog drops it from component state.
 */
export function UsuarioPasswordDialog({
  open,
  onOpenChange,
  usuario,
  onConfirm,
  isCurrentUser = false,
  onSelfSessionClosed,
}: UsuarioPasswordDialogProps) {
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const reset = () => {
    setMode("generate");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setReason("");
    setIsSubmitting(false);
    setError(null);
    setNewPassword(null);
  };

  useEffect(() => {
    if (open) reset();
  }, [open, usuario.id]);

  const trimmedReason = reason.trim();
  const passwordTooShort = mode === "manual" && password.length < MIN_PASSWORD_LENGTH;
  const passwordTooLong =
    mode === "manual" && new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES;
  const mismatch = mode === "manual" && password !== confirmPassword;
  const canConfirm =
    trimmedReason !== "" && !passwordTooShort && !passwordTooLong && !mismatch && !isSubmitting;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    const hadResult = newPassword !== null;
    reset();
    onOpenChange(false);
    if (hadResult && isCurrentUser) onSelfSessionClosed?.();
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: ResetPasswordPayload =
        mode === "generate"
          ? { generate: true, reason: trimmedReason }
          : { password, reason: trimmedReason };
      const result = await onConfirm(usuario.id, payload);
      if (result.ok && result.password) {
        setPassword("");
        setConfirmPassword("");
        setNewPassword(result.password);
      } else {
        setError(passwordErrorMessage(result.error, "No se pudo cambiar la contraseña"));
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (newPassword === null) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      toast.success("Contraseña copiada");
    } catch {
      toast.error("No se pudo copiar la contraseña");
    }
  };

  if (newPassword !== null) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contraseña actualizada</DialogTitle>
            <DialogDescription>
              Nueva contraseña de {usuario.nombre} (@{usuario.username}).
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              readOnly
              aria-label="Nueva contraseña"
              value={newPassword}
              className="font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
          </div>

          <p className="text-sm text-destructive">
            Esta contraseña no se volverá a mostrar. Compártala con el usuario por un canal seguro.
          </p>
          {isCurrentUser && (
            <p className="text-sm text-muted-foreground">
              Cambió su propia contraseña: su sesión se cerrará al pulsar "Listo".
            </p>
          )}

          <DialogFooter>
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Defina una nueva contraseña para {usuario.nombre} (@{usuario.username}). Las sesiones
            abiertas de este usuario se cerrarán.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex gap-4" role="radiogroup" aria-label="Modo">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="password-mode"
                checked={mode === "generate"}
                onChange={() => setMode("generate")}
              />
              Generar automáticamente
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="password-mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              Escribir contraseña
            </label>
          </div>

          {mode === "manual" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="admin-new-password">Nueva contraseña (mín. 8 caracteres)</Label>
                <div className="flex gap-2">
                  <Input
                    id="admin-new-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {password !== "" && passwordTooShort && (
                  <p className="text-xs text-destructive">{ERROR_MESSAGES.password_too_short}</p>
                )}
                {passwordTooLong && (
                  <p className="text-xs text-destructive">{ERROR_MESSAGES.password_too_long}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-confirm-password">Confirmar contraseña</Label>
                <Input
                  id="admin-confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword !== "" && mismatch && (
                  <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
                )}
              </div>
            </>
          )}

          <Textarea
            placeholder="Motivo (obligatorio)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            {mode === "generate" ? "Generar contraseña" : "Cambiar contraseña"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
