import { stat } from "node:fs/promises";
import { extname, join } from "node:path";

/**
 * If `outArg` is a directory (trailing slash, or already exists on disk as
 * one), returns `<outArg>/<defaultBaseName>` so the caller can treat the
 * result as a normal file base from here on. Otherwise returns `outArg`
 * unchanged — a bare name with no trailing slash that doesn't already exist
 * as a directory keeps today's "treat as file base" behavior.
 */
export async function expandOutDir(
  outArg: string,
  defaultBaseName = "erd",
): Promise<string> {
  let treatAsDir = outArg.endsWith("/") || outArg.endsWith("\\");
  if (!treatAsDir) {
    try {
      treatAsDir = (await stat(outArg)).isDirectory();
    } catch {
      treatAsDir = false;
    }
  }
  return treatAsDir ? join(outArg, defaultBaseName) : outArg;
}

export function resolveOutPath(
  base: string,
  extension: string,
  allExtensions: string[],
): string {
  const ext = extname(base).slice(1);

  // A single format with an explicit extension is used exactly as given
  // (e.g. --out erd.md).
  if (allExtensions.length === 1) {
    return ext ? base : `${base}.${extension}`;
  }

  // With multiple formats, only strip an existing extension if it matches
  // one this run will actually produce (e.g. base "erd.mmd" while also
  // emitting dbml) — otherwise it's part of the intended name (e.g.
  // "file.erd") and each emitter's extension is appended after it.
  if (ext && allExtensions.includes(ext)) {
    return `${base.slice(0, -(ext.length + 1))}.${extension}`;
  }
  return `${base}.${extension}`;
}
