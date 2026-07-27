import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  // Declarations are emitted separately via `tsc` (see tsconfig.build.json)
  // — tsup's `dts`/`experimentalDts` options both drive the `typescript`
  // package's JS API (rollup-plugin-dts, or tsup's own emit path), and
  // this project's typescript@7 install doesn't expose that classic API
  // surface (crashes on `ts.sys...` / missing `parseJsonConfigFileContent`).
  // Plain `tsc` via the CLI works fine, so declarations are a second step.
  dts: false,
  // Keep as a real dependency instead of bundling: it resolves its own
  // engine binaries/wasm assets relative to its installed location, which
  // breaks if esbuild inlines it into dist/cli.js.
  external: ["@prisma/internals"],
});
