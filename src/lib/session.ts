/**
 * src/lib/session.ts — per-tab session storage.
 *
 * The session lives in sessionStorage so each browser tab keeps its own
 * identity (localStorage is shared across tabs and let a second login swap
 * the user of every open tab). Closing the tab ends the session.
 */

export const SESSION_KEYS = [
  "token",
  "username",
  "userRol",
  "userId",
  "userNombre",
  "pending_employee_data",
] as const;

export type SessionKey = (typeof SESSION_KEYS)[number];

export const getSessionItem = (key: SessionKey): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setSessionItem = (key: SessionKey, value: string): void => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // storage unavailable: the session just won't persist
  }
};

export const removeSessionItem = (key: SessionKey): void => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const getToken = () => getSessionItem("token");
export const isAuthenticated = () => !!getToken();
export const isAdminSession = () => getSessionItem("userRol") === "admin";

export interface SessionUser {
  id: number;
  username: string;
  nombre: string;
  rol: string;
}

export const saveSession = (token: string, user: SessionUser): void => {
  setSessionItem("token", token);
  setSessionItem("username", user.username);
  setSessionItem("userRol", user.rol);
  setSessionItem("userId", String(user.id));
  setSessionItem("userNombre", user.nombre);
};

/** Removes every session key from this tab. */
export const clearSession = (): void => {
  SESSION_KEYS.forEach(removeSessionItem);
};

/**
 * Removes the session keys older versions stored in the shared localStorage,
 * so an old token is never picked up (or shared between tabs) again.
 */
export const purgeLegacySession = (): void => {
  try {
    SESSION_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
};
