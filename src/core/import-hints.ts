// The Sequelize/Mongoose/TypeORM adapters import the target project's own
// code via tsx to read its ORM metadata. When that import throws, the raw
// error is often opaque (a bare "Cannot find module" or a TypeORM internal
// decorator error) for the handful of mistakes that come up repeatedly.
// This maps those known shapes to an actionable hint; anything else is left
// alone rather than guessing wrong.

interface HintRule {
  pattern: RegExp;
  hint: (match: RegExpMatchArray) => string;
}

const RULES: HintRule[] = [
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    hint: (match) =>
      `Missing dependency "${match[1]}" in the target project — orm2erd imports its code directly, so its own dependencies must be installed too (run "npm install" there).`,
  },
  {
    pattern:
      /Reflect\.getMetadata is not a function|Reflect\.decorate is not a function/,
    hint: () =>
      `This looks like TypeORM decorators running without "reflect-metadata" loaded — check that the entry file (or one it imports) has \`import "reflect-metadata"\` at the very top.`,
  },
  {
    pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo/,
    hint: () =>
      `This looks like an eager database connection attempt at import time (e.g. ".authenticate()"/".sync()"/".connect()" outside a guard) — orm2erd only reads schema metadata and never needs a live DB connection.`,
  },
  {
    pattern: /No driver specified|No database specified/,
    hint: () =>
      `MikroORM's config needs a real "driver" and "dbName"/"clientUrl" — use \`defineConfig\` from your driver package (e.g. \`import { defineConfig } from "@mikro-orm/postgresql"\`) rather than a plain options object with no driver.`,
  },
  {
    pattern: /Please provide either 'type' or 'entity' attribute in (\S+)/,
    hint: (match) =>
      `MikroORM property "${match[1]}" has no explicit type and relies on "emitDecoratorMetadata" reflection to infer it, which orm2erd's lightweight TS transform doesn't emit — add an explicit \`type\`/\`entity\` option to that property's decorator, or configure @mikro-orm/reflection's TsMorphMetadataProvider in the target's own config.`,
  },
  {
    pattern: /Cannot read properties of undefined \(reading 'constructor'\)/,
    hint: () =>
      `This looks like a MikroORM decorator running under the wrong calling convention — check that a tsconfig.json with "experimentalDecorators": true is discoverable above the entity files (and, if you're relying on implicit property types, "emitDecoratorMetadata": true too).`,
  },
  {
    pattern:
      /is not defined in ES module scope|Unexpected token ['"]export['"]|require is not defined/,
    hint: () =>
      `This looks like a CommonJS/ESM mismatch — check the target project's package.json "type" field (or the entry file's extension, e.g. .cjs/.mjs) against how the file is actually written.`,
  },
];

export function friendlyImportHint(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const haystack = `${err.message}\n${err.stack ?? ""}`;
  for (const rule of RULES) {
    const match = haystack.match(rule.pattern);
    if (match) return rule.hint(match);
  }
  return undefined;
}
