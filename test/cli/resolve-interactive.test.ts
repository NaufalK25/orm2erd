import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DetectedORM } from "../../src/detect";
import type {
  CommonOptions,
  LogMessageOptions,
  SelectOptions,
  TextOptions,
} from "@clack/prompts";
import type { GridMultiSelectOptions } from "../../src/core/grid-multiselect";

// @clack/core's CANCEL_SYMBOL isn't exported, so cancellation is driven via
// a sentinel value fed through a mocked isCancel — same approach as
// render.test.ts. select/text/log are mocked outright since what's under
// test is resolve.ts's own branching (which prompt, with what options, what
// happens to the result), not @clack/prompts' rendering.
const CANCEL_SENTINEL = "__TEST_CANCEL__";
vi.mock("@clack/prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clack/prompts")>();
  return {
    ...actual,
    select: vi.fn<(opts: SelectOptions<unknown>) => Promise<unknown>>(),
    text: vi.fn<(opts: TextOptions) => Promise<string | symbol>>(),
    log: {
      ...actual.log,
      step: vi.fn<(message: string, opts?: LogMessageOptions) => void>(),
    },
    isCancel: (value: unknown) => value === CANCEL_SENTINEL,
    cancel: vi.fn<(message?: string, opts?: CommonOptions) => void>(),
  };
});

vi.mock("../../src/core/grid-multiselect", () => ({
  gridMultiselect:
    vi.fn<
      (opts: GridMultiSelectOptions<unknown>) => Promise<unknown[] | symbol>
    >(),
}));

import { select, text } from "@clack/prompts";
import { gridMultiselect } from "../../src/core/grid-multiselect";
import {
  resolveCaseMode,
  resolveEntryPath,
  resolveFormats,
  resolveInflectMode,
  resolveNameMode,
  resolveOutBase,
  resolveORM,
  resolveRelationLabelMode,
  resolveTypeMode,
} from "../../src/cli/resolve";

const mockSelect = vi.mocked(select);
const mockText = vi.mocked(text);
const mockGridMultiselect = vi.mocked(gridMultiselect);

function mockExit() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  }) as unknown as { mockRestore(): void };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveORM (interactive)", () => {
  it("prompts to pick among multiple detected ORMs and pairs the choice with its candidates", async () => {
    const detected: DetectedORM[] = [
      {
        name: "prisma",
        found: true,
        candidates: ["a.prisma"],
        confidence: 0.5,
      },
      {
        name: "drizzle",
        found: true,
        candidates: ["drizzle.config.ts"],
        confidence: 0.5,
      },
    ];
    mockSelect.mockResolvedValueOnce("drizzle");

    const result = await resolveORM(detected, true, undefined);

    expect(mockSelect).toHaveBeenCalledOnce();
    expect(mockSelect.mock.calls[0][0].options).toEqual([
      { value: "prisma", label: "prisma", hint: "confidence 0.5" },
      { value: "drizzle", label: "drizzle", hint: "confidence 0.5" },
    ]);
    expect(result).toEqual({
      ormName: "drizzle",
      entryCandidates: ["drizzle.config.ts"],
    });
  });

  it("prompts across every supported ORM when none was detected", async () => {
    mockSelect.mockResolvedValueOnce("mongoose");

    const result = await resolveORM([], true, undefined);

    expect(mockSelect).toHaveBeenCalledOnce();
    const options = mockSelect.mock.calls[0][0].options as { value: string }[];
    expect(options.map((o) => o.value)).toContain("mongoose");
    expect(result).toEqual({ ormName: "mongoose", entryCandidates: [] });
  });

  it("exits 0 when the multi-ORM picker is cancelled", async () => {
    const exit = mockExit();
    mockSelect.mockResolvedValueOnce(CANCEL_SENTINEL as never);
    const detected: DetectedORM[] = [
      { name: "prisma", found: true, candidates: [], confidence: 0.5 },
      { name: "drizzle", found: true, candidates: [], confidence: 0.5 },
    ];

    await expect(resolveORM(detected, true, undefined)).rejects.toThrow(
      "process.exit(0)",
    );
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("resolveEntryPath (interactive)", () => {
  it("prompts to pick among multiple ambiguous candidates", async () => {
    mockSelect.mockResolvedValueOnce("prisma/schema/b.prisma");

    const result = await resolveEntryPath(
      "prisma",
      ["prisma/schema/a.prisma", "prisma/schema/b.prisma"],
      true,
    );

    expect(mockSelect).toHaveBeenCalledOnce();
    expect(result).toBe("prisma/schema/b.prisma");
  });

  it("prompts for free text, pre-filled with the single suggested candidate", async () => {
    mockText.mockResolvedValueOnce("./custom/schema.prisma");

    const result = await resolveEntryPath("prisma", ["schema.prisma"], true);

    expect(mockText).toHaveBeenCalledOnce();
    expect(mockText.mock.calls[0][0].initialValue).toBe("schema.prisma");
    expect(result).toBe("./custom/schema.prisma");
  });

  it("exits 0 when the entry-path prompt is cancelled", async () => {
    const exit = mockExit();
    mockText.mockResolvedValueOnce(CANCEL_SENTINEL as never);

    await expect(resolveEntryPath("prisma", [], true)).rejects.toThrow(
      "process.exit(0)",
    );
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("resolveFormats (interactive)", () => {
  it("defers to gridMultiselect, defaulting the initial selection to mermaid", async () => {
    mockGridMultiselect.mockResolvedValueOnce(["dbml", "d2"]);

    const result = await resolveFormats(true, undefined);

    expect(mockGridMultiselect).toHaveBeenCalledOnce();
    expect(mockGridMultiselect.mock.calls[0][0].initialValues).toEqual([
      "mermaid",
    ]);
    expect(result).toEqual(["dbml", "d2"]);
  });

  it("skips the prompt entirely when --format was already given", async () => {
    const result = await resolveFormats(true, "mermaid");
    expect(mockGridMultiselect).not.toHaveBeenCalled();
    expect(result).toEqual(["mermaid"]);
  });
});

describe("resolveTypeMode (interactive)", () => {
  it("prompts to choose between canonical and native", async () => {
    mockSelect.mockResolvedValueOnce("native");
    await expect(resolveTypeMode(true, undefined)).resolves.toBe("native");
    expect(mockSelect).toHaveBeenCalledOnce();
  });
});

describe("resolveNameMode (interactive)", () => {
  it("prompts to choose between table, model, and both", async () => {
    mockSelect.mockResolvedValueOnce("both");
    await expect(resolveNameMode(true, undefined)).resolves.toBe("both");
    expect(mockSelect).toHaveBeenCalledOnce();
    expect(mockSelect.mock.calls[0][0].initialValue).toBe("table");
  });

  it("skips the prompt entirely when --names was already given", async () => {
    const result = await resolveNameMode(true, "model");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(result).toBe("model");
  });
});

describe("resolveRelationLabelMode (interactive)", () => {
  it("prompts to choose between both, alias, and column", async () => {
    mockSelect.mockResolvedValueOnce("alias");
    await expect(resolveRelationLabelMode(true, undefined)).resolves.toBe(
      "alias",
    );
    expect(mockSelect).toHaveBeenCalledOnce();
    expect(mockSelect.mock.calls[0][0].initialValue).toBe("both");
  });

  it("skips the prompt entirely when --relation-label was already given", async () => {
    const result = await resolveRelationLabelMode(true, "column");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(result).toBe("column");
  });
});

describe("resolveCaseMode (interactive)", () => {
  it("prompts to choose an identifier casing", async () => {
    mockSelect.mockResolvedValueOnce("screaming_snake");
    await expect(resolveCaseMode(true, undefined)).resolves.toBe(
      "screaming_snake",
    );
    expect(mockSelect).toHaveBeenCalledOnce();
    expect(mockSelect.mock.calls[0][0].initialValue).toBe("preserve");
  });

  it("skips the prompt entirely when --case was already given", async () => {
    const result = await resolveCaseMode(true, "kebab");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(result).toBe("kebab");
  });
});

describe("resolveInflectMode (interactive)", () => {
  it("prompts to choose a pluralization mode", async () => {
    mockSelect.mockResolvedValueOnce("plural");
    await expect(resolveInflectMode(true, undefined)).resolves.toBe("plural");
    expect(mockSelect).toHaveBeenCalledOnce();
    expect(mockSelect.mock.calls[0][0].initialValue).toBe("preserve");
  });

  it("skips the prompt entirely when --inflect was already given", async () => {
    const result = await resolveInflectMode(true, "singular");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(result).toBe("singular");
  });
});

describe("resolveOutBase (interactive)", () => {
  it("prompts for the output path, pre-filled with the suggested example", async () => {
    mockText.mockResolvedValueOnce("./erd/out");

    const result = await resolveOutBase(true, "erd.mmd", []);

    expect(mockText).toHaveBeenCalledOnce();
    expect(mockText.mock.calls[0][0].initialValue).toBe("erd.mmd");
    expect(result).toBe("./erd/out");
  });
});

describe("resolveOutBase (interactive) — check mode", () => {
  it("prompts without a pre-fillable default, unlike the plain-write prompt", async () => {
    mockText.mockResolvedValueOnce("./docs/erd");

    const result = await resolveOutBase(true, "erd.mmd", [], true);

    expect(mockText).toHaveBeenCalledOnce();
    const opts = mockText.mock.calls[0][0];
    expect(opts.initialValue).toBeUndefined();
    expect(opts.defaultValue).toBeUndefined();
    expect(opts.placeholder).toBe("erd.mmd");
    expect(result).toBe("./docs/erd");
  });

  it("rejects an empty submission instead of silently guessing a path", async () => {
    mockText.mockResolvedValueOnce("./docs/erd");

    await resolveOutBase(true, "erd.mmd", [], true);

    const opts = mockText.mock.calls[0][0];
    const validate = opts.validate as (value: string) => string | Error | void;
    expect(validate("")).toBe(
      "A path is required for --check — there's no safe default to guess.",
    );
    expect(validate("./docs/erd")).toBeUndefined();
  });
});
