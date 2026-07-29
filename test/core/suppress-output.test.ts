import { describe, it, expect, vi, afterEach } from "vitest";
import { withSuppressedOutput } from "../../src/core/suppress-output";

describe("withSuppressedOutput", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses console.log/info/debug/warn while fn runs", async () => {
    const logSpy = vi.spyOn(console, "log");
    const infoSpy = vi.spyOn(console, "info");
    const debugSpy = vi.spyOn(console, "debug");
    const warnSpy = vi.spyOn(console, "warn");

    await withSuppressedOutput(async () => {
      console.log("log");
      console.info("info");
      console.debug("debug");
      console.warn("warn");
    });

    // Patched to no-ops during fn, so the real console.* implementations
    // (what the spies wrap) were never invoked.
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("suppresses process.stdout/stderr writes while fn runs", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write");
    const stderrSpy = vi.spyOn(process.stderr, "write");

    await withSuppressedOutput(async () => {
      process.stdout.write("out");
      process.stderr.write("err");
    });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("restores console methods and stream writes after success", async () => {
    const originalLog = console.log;
    const originalStdoutWrite = process.stdout.write;

    await withSuppressedOutput(async () => "ok");

    expect(console.log).toBe(originalLog);
    expect(process.stdout.write).toBe(originalStdoutWrite);
  });

  it("restores console methods and stream writes even when fn throws", async () => {
    const originalLog = console.log;
    const originalStdoutWrite = process.stdout.write;

    await expect(
      withSuppressedOutput(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(console.log).toBe(originalLog);
    expect(process.stdout.write).toBe(originalStdoutWrite);
  });

  it("resolves with fn's return value", async () => {
    await expect(withSuppressedOutput(async () => 42)).resolves.toBe(42);
  });

  it("does not suppress output before or after fn runs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    console.log("before");
    await withSuppressedOutput(async () => {});
    console.log("after");

    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});
