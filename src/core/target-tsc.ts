import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export interface TscBuild {
  outDir: string;
  projectRoot: string;
}

function findNearestTsconfig(fromDir: string): string | undefined {
  let dir = fromDir;
  while (true) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// TypeORM's and MikroORM's classic decorators expect TypeScript's legacy
// `experimentalDecorators` calling convention and often rely on
// `emitDecoratorMetadata`-emitted design:type reflection to infer column
// types. esbuild (which tsImport uses under the hood) doesn't support
// emitDecoratorMetadata at all (deliberately out of scope, per the esbuild
// maintainers) and doesn't correctly emulate the legacy calling convention
// either, so importing raw decorated .ts crashes inside the ORM's own
// decorator code. Compiling with the target project's own installed
// `typescript` + its own tsconfig.json first (real tsc, not orm2erd's
// lightweight transform) sidesteps this entirely.
export function runTargetTsc(
  fromDir: string,
  orm: "TypeORM" | "MikroORM",
  extraArgs: string[] = [],
): TscBuild {
  const tsconfigPath = findNearestTsconfig(fromDir);
  if (!tsconfigPath) {
    throw new Error(
      `Could not find a tsconfig.json above "${fromDir}" to compile ${orm}'s decorated entities with. It's needed because ${orm}'s decorators don't run correctly under orm2erd's lightweight TS transform (it can't emit "emitDecoratorMetadata"). Add a tsconfig.json, or point --entry at already-compiled JS output instead.`,
    );
  }
  const projectRoot = dirname(tsconfigPath);

  // Trailing slash: createRequire(dir) would resolve from dir's parent.
  const targetRequire = createRequire(join(fromDir, "/"));
  let tscBinPath: string;
  try {
    tscBinPath = join(
      dirname(targetRequire.resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
  } catch (err) {
    throw new Error(
      `Could not resolve "typescript" from "${fromDir}". It's needed to compile ${orm}'s decorated entities correctly. Install it in the target project, or point --entry at already-compiled JS output instead.`,
      { cause: err },
    );
  }

  // Created inside the target project (not the system temp dir) so Node's
  // usual upward node_modules search still finds the target's own installed
  // packages (the ORM, reflect-metadata, ...) when the compiled output is
  // later imported: a temp dir elsewhere would resolve against nothing.
  const outDir = mkdtempSync(
    join(projectRoot, `.orm2erd-${orm.toLowerCase()}-build-`),
  );
  // Force CommonJS output and pin it with our own package.json, regardless
  // of what the nearest real ancestor package.json says: outDir has none of
  // its own, so without this, Node would fall back to whatever "type" the
  // target project (or some further ancestor) happens to declare, and
  // misinterpret the emitted CJS as ESM if that says "module".
  writeFileSync(join(outDir, "package.json"), '{"type":"commonjs"}');

  try {
    execFileSync(
      process.execPath,
      [
        tscBinPath,
        "-p",
        tsconfigPath,
        "--outDir",
        outDir,
        "--rootDir",
        projectRoot,
        "--module",
        "commonjs",
        ...extraArgs,
      ],
      { stdio: "pipe" },
    );
  } catch {
    // noEmitOnError defaults to false, so tsc still emits output even when
    // the target project has unrelated type errors elsewhere in its
    // tsconfig's include: treat this as best-effort and let the caller
    // decide whether what it needed actually got emitted.
  }

  return { outDir, projectRoot };
}
