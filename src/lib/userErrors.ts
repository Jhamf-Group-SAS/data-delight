export const PROTECTED_USER_MESSAGE =
  "Este usuario está protegido y solo puede ser modificado por sí mismo";

/** Message for an admin user-mutation error code, falling back to the code itself. */
export const userErrorMessage = (code: string | undefined, fallback: string): string =>
  code === "protected_user" ? PROTECTED_USER_MESSAGE : code || fallback;
