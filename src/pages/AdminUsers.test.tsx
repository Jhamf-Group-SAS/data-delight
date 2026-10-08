import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminUsers from "./AdminUsers";
import { api } from "@/lib/api";
import { PROTECTED_USER_MESSAGE, userErrorMessage } from "@/lib/userErrors";

vi.mock("@/lib/api", () => ({
  api: {
    getUsuarios: vi.fn(),
    changeOwnPassword: vi.fn(),
  },
}));

const user = (over: Record<string, unknown>) => ({
  nombre: "N",
  rol: "admin",
  activo: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AdminUsers — protected rows", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem("token", "tok");
    window.sessionStorage.setItem("userRol", "admin");
    window.sessionStorage.setItem("userId", "1");
    vi.mocked(api.getUsuarios).mockResolvedValue([
      user({ id: 1, username: "otro" }),
      user({ id: 2, username: "lmurillo", protegido: true }),
    ] as never);
  });

  it("disables edit, estado and password for a protected row of another user", async () => {
    renderPage();
    await screen.findByText("@lmurillo");

    const protectedButtons = screen.getAllByTitle("Usuario protegido");
    expect(protectedButtons).toHaveLength(3);
    protectedButtons.forEach((b) => expect(b).toBeDisabled());
    // History stays available for everyone.
    expect(screen.getAllByTitle("Ver auditoría")).toHaveLength(2);
  });

  it("leaves a protected row enabled for the protected user themselves", async () => {
    window.sessionStorage.setItem("userId", "2");
    renderPage();
    await screen.findByText("@lmurillo");

    expect(screen.queryAllByTitle("Usuario protegido")).toHaveLength(0);
    expect(screen.getAllByTitle("Editar usuario")[1]).toBeEnabled();
    expect(screen.getAllByTitle("Cambiar contraseña")[1]).toBeEnabled();
  });

  it("renders a logout button in the header", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });
});

describe("userErrorMessage", () => {
  it("maps protected_user to the Spanish message and passes other codes through", () => {
    expect(userErrorMessage("protected_user", "x")).toBe(PROTECTED_USER_MESSAGE);
    expect(userErrorMessage("not_found", "x")).toBe("not_found");
    expect(userErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
