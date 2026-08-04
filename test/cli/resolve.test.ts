import { describe, it, expect, vi, afterEach } from "vitest";
import type { DetectedORM } from "../../src/detect";
import { emitters } from "../../src/emitters";
import {
  resolveCaseMode,
  resolveEntryPath,
  resolveFormats,
  resolveNameMode,
  resolveOutBase,
  resolveORM,
  resolveRelationLabelMode,
  resolveTypeMode,
} from "../../src/cli/resolve";

// resolveORM/resolveEntryPath call process.exit(1) on unresolvable
// non-interactive states instead of returning — mock it to throw so those
// paths can be asserted without actually killing the test process.
function mockExit() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  }) as unknown as { mockRestore(): void };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveORM (non-interactive)", () => {
  it("uses the --orm value as-is when detection found nothing for it", async () => {
    const result = await resolveORM([], false, "prisma");
    expect(result).toEqual({ ormName: "prisma", entryCandidates: [] });
  });

  it("pairs the --orm value with detection's candidates for that ORM", async () => {
    const detected: DetectedORM[] = [
      {
        name: "prisma",
        found: true,
        candidates: ["schema.prisma"],
        confidence: 1,
      },
    ];
    const result = await resolveORM(detected, false, "prisma");
    expect(result).toEqual({
      ormName: "prisma",
      entryCandidates: ["schema.prisma"],
    });
  });

  it("adopts the single detected ORM when --orm is omitted", async () => {
    const detected: DetectedORM[] = [
      {
        name: "sequelize",
        found: true,
        candidates: ["models/"],
        confidence: 1,
      },
    ];
    const result = await resolveORM(detected, false, undefined);
    expect(result).toEqual({
      ormName: "sequelize",
      entryCandidates: ["models/"],
    });
  });

  it("exits non-zero when multiple ORMs are detected and --orm is omitted", async () => {
    const exit = mockExit();
    const detected: DetectedORM[] = [
      { name: "prisma", found: true, candidates: [], confidence: 0.5 },
      { name: "drizzle", found: true, candidates: [], confidence: 0.5 },
    ];
    await expect(resolveORM(detected, false, undefined)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits non-zero when no ORM is detected and --orm is omitted", async () => {
    const exit = mockExit();
    await expect(resolveORM([], false, undefined)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("resolveEntryPath (non-interactive)", () => {
  it("returns the single candidate", async () => {
    await expect(
      resolveEntryPath("prisma", ["schema.prisma"], false),
    ).resolves.toBe("schema.prisma");
  });

  it("exits non-zero when multiple candidates are ambiguous", async () => {
    const exit = mockExit();
    await expect(
      resolveEntryPath("prisma", ["a.prisma", "b.prisma"], false),
    ).rejects.toThrow("process.exit(1)");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits non-zero when there are no candidates at all", async () => {
    const exit = mockExit();
    await expect(resolveEntryPath("prisma", [], false)).rejects.toThrow(
      "process.exit(1)",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("resolveFormats", () => {
  it("expands 'all' (case/whitespace-insensitive) to every registered emitter", async () => {
    await expect(resolveFormats(false, "  ALL ")).resolves.toEqual(
      Object.keys(emitters),
    );
  });

  it("splits and trims a comma-separated --format value", async () => {
    await expect(resolveFormats(false, "dbml, mermaid")).resolves.toEqual([
      "dbml",
      "mermaid",
    ]);
  });

  it("defaults to mermaid non-interactively with no --format", async () => {
    await expect(resolveFormats(false, undefined)).resolves.toEqual([
      "mermaid",
    ]);
  });
});

describe("resolveTypeMode", () => {
  it("returns the explicit --type-mode value", async () => {
    await expect(resolveTypeMode(false, "native")).resolves.toBe("native");
  });

  it("defaults to canonical non-interactively", async () => {
    await expect(resolveTypeMode(false, undefined)).resolves.toBe("canonical");
  });
});

describe("resolveNameMode", () => {
  it("returns the explicit --names value", async () => {
    await expect(resolveNameMode(false, "both")).resolves.toBe("both");
  });

  it("defaults to table non-interactively", async () => {
    await expect(resolveNameMode(false, undefined)).resolves.toBe("table");
  });
});

describe("resolveRelationLabelMode", () => {
  it("returns the explicit --relation-label value", async () => {
    await expect(resolveRelationLabelMode(false, "column")).resolves.toBe(
      "column",
    );
  });

  it("defaults to both non-interactively", async () => {
    await expect(resolveRelationLabelMode(false, undefined)).resolves.toBe(
      "both",
    );
  });
});

describe("resolveCaseMode", () => {
  it("returns the explicit --case value", async () => {
    await expect(resolveCaseMode(false, "snake")).resolves.toBe("snake");
  });

  it("defaults to preserve non-interactively", async () => {
    await expect(resolveCaseMode(false, undefined)).resolves.toBe("preserve");
  });
});

describe("resolveOutBase (non-interactive)", () => {
  it("always defaults to 'erd', regardless of the emitter selection", async () => {
    await expect(resolveOutBase(false, "erd.mmd", [])).resolves.toBe("erd");
  });
});
