import { describe, it, expect } from "vitest";
import { loadConfig, ConfigError } from "./config.js";

describe("config — loadConfig", () => {
  it("throws ConfigError when JWT_SECRET is missing from env", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("throws ConfigError when JWT_SECRET is an empty string", () => {
    expect(() => loadConfig({ JWT_SECRET: "" })).toThrow(ConfigError);
  });

  it("throws ConfigError when JWT_SECRET is only whitespace", () => {
    expect(() => loadConfig({ JWT_SECRET: "   " })).toThrow(ConfigError);
  });

  it("returns the loaded config when JWT_SECRET is a valid non-empty string", () => {
    const config = loadConfig({ JWT_SECRET: "a-valid-secret-value" });
    expect(config).toEqual({ jwtSecret: "a-valid-secret-value", protectedUsernames: [] });
  });

  it("error message explains there is no fallback default, matching the pre-existing inline check", () => {
    try {
      loadConfig({});
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.message).toBe(
        "JWT_SECRET environment variable is required and has no fallback default. Refusing to start."
      );
    }
  });
});
