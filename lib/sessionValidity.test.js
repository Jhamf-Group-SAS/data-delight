import { describe, it, expect, vi } from "vitest";
import { checkSessionValidity, SESSION_EXPIRED_MESSAGE } from "./sessionValidity.js";

const poolWith = (row) => ({ execute: vi.fn().mockResolvedValue([row ? [row] : []]) });

describe("checkSessionValidity", () => {
  it("accepts a token when the password was never changed", async () => {
    const r = await checkSessionValidity(poolWith({ activo: 1, changed_at: null }), { id: 1, iat: 1000 });
    expect(r).toEqual({ ok: true });
  });

  it("rejects a token issued before the password change", async () => {
    const r = await checkSessionValidity(poolWith({ activo: 1, changed_at: "2000.000000" }), { id: 1, iat: 1999 });
    expect(r).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it("accepts a token issued in the same second or after the change", async () => {
    const pool = poolWith({ activo: 1, changed_at: "2000.000000" });
    expect((await checkSessionValidity(pool, { id: 1, iat: 2000 })).ok).toBe(true);
    expect((await checkSessionValidity(pool, { id: 1, iat: 2001 })).ok).toBe(true);
  });

  it("fails closed when iat is missing and a change is recorded", async () => {
    const r = await checkSessionValidity(poolWith({ activo: 1, changed_at: "2000" }), { id: 1 });
    expect(r.ok).toBe(false);
  });

  it("rejects inactive or missing users", async () => {
    expect((await checkSessionValidity(poolWith({ activo: 0, changed_at: null }), { id: 1, iat: 1 })).ok).toBe(false);
    expect((await checkSessionValidity(poolWith(null), { id: 1, iat: 1 })).ok).toBe(false);
  });
});
