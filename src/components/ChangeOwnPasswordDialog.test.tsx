import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChangeOwnPasswordDialog } from "./ChangeOwnPasswordDialog";
import { api } from "@/lib/api";
import { toast } from "sonner";

vi.mock("@/lib/api", () => ({ api: { changeOwnPassword: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fill = (current: string, next: string, confirm: string) => {
  fireEvent.change(screen.getByLabelText(/contraseña actual/i), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^nueva contraseña/i), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), { target: { value: confirm } });
};

describe("ChangeOwnPasswordDialog", () => {
  beforeEach(() => {
    vi.mocked(api.changeOwnPassword).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("keeps submit disabled until fields are valid, match, and differ from the current password", () => {
    render(<ChangeOwnPasswordDialog open onOpenChange={() => {}} />);
    const submit = screen.getByRole("button", { name: /cambiar contraseña/i });

    fill("actual-123", "corta", "corta");
    expect(submit).toBeDisabled();

    fill("actual-123", "nueva-segura-1", "otra-distinta-1");
    expect(submit).toBeDisabled();
    expect(screen.getByText(/no coinciden/i)).toBeInTheDocument();

    fill("actual-123", "actual-123", "actual-123");
    expect(submit).toBeDisabled();
    expect(screen.getByText(/distinta de la actual/i)).toBeInTheDocument();

    fill("actual-123", "nueva-segura-1", "nueva-segura-1");
    expect(submit).toBeEnabled();
  });

  it("submits, toasts and closes on success", async () => {
    vi.mocked(api.changeOwnPassword).mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(<ChangeOwnPasswordDialog open onOpenChange={onOpenChange} />);

    fill("actual-123", "nueva-segura-1", "nueva-segura-1");
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.changeOwnPassword).toHaveBeenCalledWith({
      currentPassword: "actual-123",
      newPassword: "nueva-segura-1",
    });
    expect(toast.success).toHaveBeenCalledWith("Contraseña actualizada");
  });

  it("shows a Spanish message for invalid_current_password and stays open", async () => {
    vi.mocked(api.changeOwnPassword).mockResolvedValue({ ok: false, error: "invalid_current_password" });
    const onOpenChange = vi.fn();
    render(<ChangeOwnPasswordDialog open onOpenChange={onOpenChange} />);

    fill("equivocada-1", "nueva-segura-1", "nueva-segura-1");
    fireEvent.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
