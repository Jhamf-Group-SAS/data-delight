import { describe, it, expect, beforeEach } from "vitest";
import {
  SESSION_KEYS,
  saveSession,
  clearSession,
  purgeLegacySession,
  getToken,
  isAdminSession,
  isAuthenticated,
} from "./session";

describe("session — per-tab storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("saveSession writes every key to sessionStorage and never to localStorage", () => {
    saveSession("tok", { id: 5, username: "ana", nombre: "Ana", rol: "admin" });

    expect(window.sessionStorage.getItem("token")).toBe("tok");
    expect(window.sessionStorage.getItem("userId")).toBe("5");
    expect(window.sessionStorage.getItem("userNombre")).toBe("Ana");
    expect(window.localStorage.length).toBe(0);
    expect(getToken()).toBe("tok");
    expect(isAuthenticated()).toBe(true);
    expect(isAdminSession()).toBe(true);
  });

  it("reports operators as non-admin", () => {
    saveSession("tok", { id: 6, username: "op", nombre: "Op", rol: "operador" });
    expect(isAdminSession()).toBe(false);
  });

  it("clearSession removes every session key", () => {
    saveSession("tok", { id: 5, username: "ana", nombre: "Ana", rol: "admin" });
    window.sessionStorage.setItem("pending_employee_data", "[]");

    clearSession();

    SESSION_KEYS.forEach((key) => expect(window.sessionStorage.getItem(key)).toBeNull());
    expect(isAuthenticated()).toBe(false);
  });

  it("purgeLegacySession drops legacy localStorage session keys but keeps other entries", () => {
    SESSION_KEYS.forEach((key) => window.localStorage.setItem(key, "old"));
    window.localStorage.setItem("ui-pref", "dark");

    purgeLegacySession();

    SESSION_KEYS.forEach((key) => expect(window.localStorage.getItem(key)).toBeNull());
    expect(window.localStorage.getItem("ui-pref")).toBe("dark");
  });
});
