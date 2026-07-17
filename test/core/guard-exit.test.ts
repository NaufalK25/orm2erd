import { describe, it, expect } from "vitest";
import { withGuardedExit } from "../../src/core/guard-exit";

describe("withGuardedExit", () => {
  it("turns a process.exit() call inside fn into a catchable error instead of killing the process", async () => {
    await expect(
      withGuardedExit(async () => {
        process.exit(1);
      }),
    ).rejects.toThrow(/process\.exit\(1\)/);
  });

  it("restores the original process.exit afterwards, even on success", async () => {
    const originalExit = process.exit;
    await withGuardedExit(async () => "ok");
    expect(process.exit).toBe(originalExit);
  });

  it("restores the original process.exit afterwards, even on failure", async () => {
    const originalExit = process.exit;
    await expect(
      withGuardedExit(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(process.exit).toBe(originalExit);
  });

  it("resolves normally when fn doesn't call process.exit", async () => {
    await expect(withGuardedExit(async () => 42)).resolves.toBe(42);
  });
});
