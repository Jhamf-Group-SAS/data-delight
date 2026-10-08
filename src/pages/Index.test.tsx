import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Index from "./Index";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    getRegistros: vi.fn(),
    getProyectos: vi.fn(),
  },
}));

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<Index />} />
          <Route path="/admin/registros" element={<p>Registros panel page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Index — /admin/registros discoverability (sdd-verify WARNING fix)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(api.getRegistros).mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
    vi.mocked(api.getProyectos).mockResolvedValue([]);
  });

  it("shows a visible Registros nav link for an authenticated operador and navigates to /admin/registros on click", async () => {
    window.sessionStorage.setItem("userRol", "operador");
    window.sessionStorage.setItem("userNombre", "Juan Perez");

    renderDashboard();

    const button = screen.getByRole("button", { name: /registros/i });

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Registros panel page")).toBeInTheDocument();
    });
  });

  it("also shows the Registros nav button for an authenticated admin, alongside the existing Usuarios button", async () => {
    window.sessionStorage.setItem("userRol", "admin");
    window.sessionStorage.setItem("userNombre", "Ana Admin");

    renderDashboard();

    expect(screen.getByRole("button", { name: /registros/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /usuarios/i })).toBeInTheDocument();
  });
});
