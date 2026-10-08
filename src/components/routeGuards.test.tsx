import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthenticatedRoute, AdminRoute } from "./routeGuards";

function renderAt(path: string, guardedElement: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Login page</p>} />
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
        <Route path="/guarded" element={guardedElement} />
      </Routes>
    </MemoryRouter>
  );
}

describe("routeGuards", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  describe("AuthenticatedRoute", () => {
    it("redirects to / when there is no token", () => {
      renderAt(
        "/guarded",
        <AuthenticatedRoute>
          <p>Secret content</p>
        </AuthenticatedRoute>
      );
      expect(screen.getByText("Login page")).toBeInTheDocument();
      expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
    });

    it("renders the guarded content for an authenticated operador (non-admin) — the CRITICAL-1 fix", () => {
      window.sessionStorage.setItem("token", "fake-jwt");
      window.sessionStorage.setItem("userRol", "operador");

      renderAt(
        "/guarded",
        <AuthenticatedRoute>
          <p>Secret content</p>
        </AuthenticatedRoute>
      );

      expect(screen.getByText("Secret content")).toBeInTheDocument();
      expect(screen.queryByText("Login page")).not.toBeInTheDocument();
      expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
    });

    it("renders the guarded content for an authenticated admin too", () => {
      window.sessionStorage.setItem("token", "fake-jwt");
      window.sessionStorage.setItem("userRol", "admin");

      renderAt(
        "/guarded",
        <AuthenticatedRoute>
          <p>Secret content</p>
        </AuthenticatedRoute>
      );

      expect(screen.getByText("Secret content")).toBeInTheDocument();
    });
  });

  describe("AdminRoute", () => {
    it("redirects a non-admin authenticated operador to /dashboard", () => {
      window.sessionStorage.setItem("token", "fake-jwt");
      window.sessionStorage.setItem("userRol", "operador");

      renderAt(
        "/guarded",
        <AdminRoute>
          <p>Admin-only content</p>
        </AdminRoute>
      );

      expect(screen.getByText("Dashboard page")).toBeInTheDocument();
      expect(screen.queryByText("Admin-only content")).not.toBeInTheDocument();
    });

    it("renders the guarded content for an authenticated admin", () => {
      window.sessionStorage.setItem("token", "fake-jwt");
      window.sessionStorage.setItem("userRol", "admin");

      renderAt(
        "/guarded",
        <AdminRoute>
          <p>Admin-only content</p>
        </AdminRoute>
      );

      expect(screen.getByText("Admin-only content")).toBeInTheDocument();
    });
  });
});
