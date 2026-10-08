import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UsuarioPasswordDialog } from "./UsuarioPasswordDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const usuario = { id: 3, username: "jperez", nombre: "Juan Perez", rol: "operador" as const, activo: 1, created_at: "2026-01-01" };

const fillReason = (value = "Olvidó su contraseña") =>
  fireEvent.change(screen.getByPlaceholderText(/motivo/i), { target: { value } });

describe("UsuarioPasswordDialog", () => {
  it("generates a password by default, requires a reason and shows the result once", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, password: "Abcd2345Efgh" });
    render(<UsuarioPasswordDialog open onOpenChange={() => {}} usuario={usuario} onConfirm={onConfirm} />);

    const submit = screen.getByRole("button", { name: /generar contraseña/i });
    expect(submit).toBeDisabled();

    fillReason();
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByLabelText(/nueva contraseña/i)).toHaveValue("Abcd2345Efgh"));
    expect(onConfirm).toHaveBeenCalledWith(usuario.id, { generate: true, reason: "Olvidó su contraseña" });
    expect(screen.getByText(/no se volverá a mostrar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it("copies the generated password to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, password: "Abcd2345Efgh" });
    render(<UsuarioPasswordDialog open onOpenChange={() => {}} usuario={usuario} onConfirm={onConfirm} />);

    fillReason();
    fireEvent.click(screen.getByRole("button", { name: /generar contraseña/i }));
    fireEvent.click(await screen.findByRole("button", { name: /copiar/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Abcd2345Efgh"));
  });

  it("validates a typed password: minimum length and confirmation match", () => {
    const onConfirm = vi.fn();
    render(<UsuarioPasswordDialog open onOpenChange={() => {}} usuario={usuario} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByLabelText(/escribir contraseña/i));
    fillReason();
    const submit = screen.getByRole("button", { name: /^cambiar contraseña$/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/nueva contraseña/i), { target: { value: "corta" } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: "corta" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/nueva contraseña/i), { target: { value: "larga-segura-1" } });
    expect(submit).toBeDisabled(); // confirmation no longer matches
    expect(screen.getByText(/no coinciden/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: "larga-segura-1" } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith(usuario.id, { password: "larga-segura-1", reason: "Olvidó su contraseña" });
  });

  it("toggles password visibility", () => {
    render(<UsuarioPasswordDialog open onOpenChange={() => {}} usuario={usuario} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/escribir contraseña/i));

    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute("type", "text");
  });

  it("maps backend error codes to Spanish and keeps the form open", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, error: "forbidden" });
    render(<UsuarioPasswordDialog open onOpenChange={() => {}} usuario={usuario} onConfirm={onConfirm} />);

    fillReason();
    fireEvent.click(screen.getByRole("button", { name: /generar contraseña/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no tiene permisos/i);
  });

  it("closing the result for the logged-in admin ends their session", async () => {
    const onSelfSessionClosed = vi.fn();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, password: "Abcd2345Efgh" });
    render(
      <UsuarioPasswordDialog
        open
        onOpenChange={onOpenChange}
        usuario={usuario}
        onConfirm={onConfirm}
        isCurrentUser
        onSelfSessionClosed={onSelfSessionClosed}
      />
    );

    fillReason();
    fireEvent.click(screen.getByRole("button", { name: /generar contraseña/i }));
    expect(await screen.findByText(/su sesión se cerrará/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /listo/i }));
    expect(onSelfSessionClosed).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not end the session when the target is another user", async () => {
    const onSelfSessionClosed = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, password: "Abcd2345Efgh" });
    render(
      <UsuarioPasswordDialog
        open
        onOpenChange={() => {}}
        usuario={usuario}
        onConfirm={onConfirm}
        onSelfSessionClosed={onSelfSessionClosed}
      />
    );

    fillReason();
    fireEvent.click(screen.getByRole("button", { name: /generar contraseña/i }));
    fireEvent.click(await screen.findByRole("button", { name: /listo/i }));

    expect(onSelfSessionClosed).not.toHaveBeenCalled();
  });
});
