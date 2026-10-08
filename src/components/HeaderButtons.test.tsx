import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChangeOwnPasswordButton } from "./ChangeOwnPasswordDialog";
import { LogoutButton } from "./LogoutButton";

vi.mock("@/lib/api", () => ({ api: { changeOwnPassword: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("header buttons", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shows 'Cambiar mi contraseña' to admins", () => {
    window.sessionStorage.setItem("userRol", "admin");
    render(<ChangeOwnPasswordButton />);
    expect(screen.getByRole("button", { name: /cambiar mi contraseña/i })).toBeInTheDocument();
  });

  it("hides 'Cambiar mi contraseña' from operators and anonymous tabs", () => {
    window.sessionStorage.setItem("userRol", "operador");
    const { rerender } = render(<ChangeOwnPasswordButton />);
    expect(screen.queryByRole("button", { name: /cambiar mi contraseña/i })).toBeNull();

    window.sessionStorage.clear();
    rerender(<ChangeOwnPasswordButton />);
    expect(screen.queryByRole("button", { name: /cambiar mi contraseña/i })).toBeNull();
  });

  it("'Cerrar sesión' clears the session", () => {
    window.sessionStorage.setItem("token", "tok");
    window.sessionStorage.setItem("userRol", "admin");
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(window.sessionStorage.getItem("token")).toBeNull();
    expect(window.sessionStorage.getItem("userRol")).toBeNull();
  });
});
