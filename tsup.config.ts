import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  dts: false,
  // Keep as a real dependency instead of bundling: it resolves its own
  // engine binaries/wasm assets relative to its installed location, which
  // breaks if esbuild inlines it into dist/cli.js.
  external: ["@prisma/internals"],
});
