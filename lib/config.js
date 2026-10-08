/**
 * lib/config.js — pure, importable extraction of the fail-closed JWT_SECRET
 * boot check (design D6 / spec "Fail-Closed Boot on Missing JWT_SECRET").
 *
 * This is a refactor of the inline check that already lived in server.js
 * (merged pre-existing on `main`) — the observable behavior (refuse to start
 * on missing/empty/whitespace-only JWT_SECRET, no fallback default) is
 * unchanged. Extracting it into a pure function makes it testable under any
 * runner without booting the actual HTTP server, closing the CRITICAL-3
 * zero-coverage gap flagged in sdd-verify.
 */

import { parseProtectedUsernames } from "./protectedUsers.js";

export class ConfigError extends Error {}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{ jwtSecret: string, protectedUsernames: string[] }}
 * @throws {ConfigError} when JWT_SECRET is missing, empty, or whitespace-only
 */
export function loadConfig(env) {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === "") {
    throw new ConfigError(
      "JWT_SECRET environment variable is required and has no fallback default. Refusing to start."
    );
  }
  return { jwtSecret, protectedUsernames: parseProtectedUsernames(env.PROTECTED_USERNAMES) };
}
