import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { globSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import type { ORMAdapter, ResolvedEntry } from "../types";
import type {
  CanonicalType,
  Entity,
  ERDModel,
  Field,
  Index,
  Relation,
  RelationAction,
} from "../../core/model";
import { loadDotEnvFiles } from "../../core/dotenv";
import type {
  DrizzleCasingModule,
  DrizzleColumn,
  DrizzleDialectInstance,
  DrizzleDialectModule,
  DrizzleDialectName,
  DrizzleKitConfig,
  DrizzleOrmModule,
  DrizzleTableConfig,
} from "./types";

// Which `drizzle-orm` dialect-core package backs each `dialect` value in
// drizzle.config, and the table/dialect class exported from it — verified
// against drizzle-kit's own compiled CLI (each dialect's
// `prepareFrom*Imports`/`generate*Snapshot`). "turso" is SQLite-compatible
// and authored with the same `sqliteTable`, so it shares sqlite-core.
const DIALECT_MODULES: Partial<
  Record<
    DrizzleDialectName,
    { specifier: string; tableExport: string; dialectExport: string }
  >
> = {
  postgresql: {
    specifier: "drizzle-orm/pg-core",
    tableExport: "PgTable",
    dialectExport: "PgDialect",
  },
  mysql: {
    specifier: "drizzle-orm/mysql-core",
    tableExport: "MySqlTable",
    dialectExport: "MySqlDialect",
  },
  sqlite: {
    specifier: "drizzle-orm/sqlite-core",
    tableExport: "SQLiteTable",
    dialectExport: "SQLiteSyncDialect",
  },
  turso: {
    specifier: "drizzle-orm/sqlite-core",
    tableExport: "SQLiteTable",
    dialectExport: "SQLiteSyncDialect",
  },
  singlestore: {
    specifier: "drizzle-orm/singlestore-core",
    tableExport: "SingleStoreTable",
    dialectExport: "SingleStoreDialect",
  },
};

const IMPORTABLE_EXTENSION = /\.(ts|mts|cts|js|mjs|cjs)$/i;

// Resolves a bare specifier (e.g. "drizzle-orm/pg-core") against the target
// project's own installed copy, not orm2erd's — same reasoning as the
// TypeORM adapter's `loadConnectionMetadataBuilderClass`: table instances
// are constructed by the target's own `drizzle-orm`, so introspecting them
// has to go through that same copy, not a separately bundled one.
function requireFromTarget<T>(fromPath: string, specifier: string): T {
  const targetRequire = createRequire(fromPath);
  try {
    return targetRequire(specifier) as T;
  } catch (err) {
    throw new Error(
      `Could not resolve "${specifier}" from "${fromPath}" — is it installed in the target project?`,
      { cause: err },
    );
  }
}

function hasDialectField(value: unknown): value is DrizzleKitConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<DrizzleKitConfig>).dialect === "string"
  );
}

function validateDrizzleKitConfig(
  content: unknown,
  configPath: string,
): DrizzleKitConfig {
  if (!hasDialectField(content)) {
    throw new Error(
      `"${configPath}" doesn't export a valid drizzle-kit config — expected a "dialect" field (e.g. export default defineConfig({ dialect: "postgresql", schema: "./schema.ts" })). See https://orm.drizzle.team/kit-docs/config-reference.`,
    );
  }
  return content;
}

async function loadDrizzleKitConfig(
  configPath: string,
): Promise<DrizzleKitConfig> {
  if (extname(configPath) === ".json") {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf-8"));
    return validateDrizzleKitConfig(parsed, configPath);
  }

  // Polyfill CJS globals, same as the Sequelize/TypeORM adapters' own entry
  // loaders — tsImport loads the file as ESM, where none of these exist.
  globalThis.require = createRequire(configPath);
  globalThis.__filename = configPath;
  globalThis.__dirname = dirname(configPath);

  const mod = await tsImport(pathToFileURL(configPath).href, import.meta.url);
  const outer = (mod as { default?: unknown }).default ?? mod;
  // When the nearest ancestor package.json doesn't declare `"type":
  // "module"`, a syntactically-ESM config file can still get run through
  // CJS interop and come back double-wrapped as `{ default: <config> }`
  // instead of `<config>` — same "double-wrapped default" shape the
  // Sequelize adapter's own loader has to tolerate. Only one extra level is
  // realistically possible here, so a single conditional unwrap covers it.
  const content = hasDialectField(outer)
    ? outer
    : ((outer as { default?: unknown })?.default ?? outer);
  return validateDrizzleKitConfig(content, configPath);
}

// `config.schema` globs are resolved relative to the directory containing
// drizzle.config.* — drizzle-kit itself resolves them against
// `process.cwd()`, which in practice is always the project root the config
// file also lives in (drizzle-kit is virtually always invoked from there).
// A matched directory expands to its immediate importable files (not
// recursive), mirroring drizzle-kit's own `prepareFilenames`.
function resolveSchemaFiles(
  schema: string | string[] | undefined,
  baseDir: string,
  configPath: string,
): string[] {
  if (!schema) {
    throw new Error(
      `"${configPath}" has no "schema" field — point it at your schema file(s)/glob(s) (see https://orm.drizzle.team/kit-docs/config-reference#schema).`,
    );
  }

  const patterns = Array.isArray(schema) ? schema : [schema];
  const files = new Set<string>();

  for (const pattern of patterns) {
    const matches = globSync(pattern, { cwd: baseDir });
    for (const match of matches) {
      const absoluteMatch = resolve(baseDir, match);
      if (!existsSync(absoluteMatch)) continue;

      if (statSync(absoluteMatch).isDirectory()) {
        for (const file of readdirSync(absoluteMatch)) {
          const filePath = resolve(absoluteMatch, file);
          if (statSync(filePath).isFile() && IMPORTABLE_EXTENSION.test(file)) {
            files.add(filePath);
          }
        }
      } else {
        files.add(absoluteMatch);
      }
    }
  }

  if (files.size === 0) {
    throw new Error(
      `No schema files found for [${patterns.map((p) => `"${p}"`).join(", ")}] (resolved against "${baseDir}").`,
    );
  }

  return Array.from(files);
}

async function loadSchemaExports(
  files: string[],
): Promise<Record<string, unknown>> {
  const merged: Record<string, unknown> = {};
  for (const file of files) {
    globalThis.require = createRequire(file);
    globalThis.__filename = file;
    globalThis.__dirname = dirname(file);

    const mod = await tsImport(pathToFileURL(file).href, import.meta.url);
    Object.assign(merged, mod as Record<string, unknown>);
  }
  return merged;
}

// `column.name` is only the true DB column name when the developer named it
// explicitly; when it falls back to the JS property key (`keyAsName`), a
// project-wide `casing` strategy still transforms it at query time — mirrors
// drizzle-kit's own `getColumnCasing` so FK/index column names line up with
// what the ORM actually sends to the database.
function resolveColumnName(
  column: DrizzleColumn,
  casing: DrizzleKitConfig["casing"],
  casingModule: DrizzleCasingModule,
): string {
  if (!column.name) return "";
  if (!column.keyAsName || casing === undefined) return column.name;
  return casing === "camelCase"
    ? casingModule.toCamelCase(column.name)
    : casingModule.toSnakeCase(column.name);
}

function toCanonicalType(column: DrizzleColumn): CanonicalType {
  if (column.enumValues && column.enumValues.length > 0) return "enum";

  switch (column.dataType) {
    case "boolean":
      return "boolean";
    case "date":
      return "datetime";
    case "json":
      return "json";
    case "bigint":
      return "bigint";
    case "buffer":
      return "bytes";
    case "string":
      return "string";
    case "number": {
      // The generic "number" bucket covers int/float/decimal alike —
      // `columnType` (e.g. "PgNumeric", "MySqlFloat") is the only signal
      // that tells them apart, since `getSQLType()` strings vary too much
      // per dialect to enumerate reliably.
      const t = column.columnType.toLowerCase();
      if (t.includes("decimal") || t.includes("numeric")) return "decimal";
      if (t.includes("real") || t.includes("double") || t.includes("float"))
        return "float";
      return "int";
    }
    default:
      return "unknown";
  }
}

// Only Postgres's `pgEnum()` backs a real, named, reusable DB enum type —
// `getSQLType()` returns that name directly (e.g. "role"), which the DBML
// emitter keys its `Enum` block off of via `nativeType`. MySQL/SQLite enums
// are always inline/anonymous instead: `getSQLType()` there returns the
// full definition (e.g. "enum('admin','author')"), which has no stable
// per-enum identity and would collide across every enum column if used as
// a block name — so those get a synthesized name instead, the same fix the
// Sequelize adapter applies for its own dialect-agnostic ENUM type.
function resolveNativeType(
  column: DrizzleColumn,
  tableName: string,
  columnName: string,
): string {
  const isNamedPgEnum =
    column.columnType === "PgEnumColumn" ||
    column.columnType === "PgEnumObjectColumn";
  if (column.enumValues && column.enumValues.length > 0 && !isNamedPgEnum) {
    return `enum_${tableName}_${columnName}`;
  }
  return column.getSQLType();
}

function resolveDefaultValue(
  column: DrizzleColumn,
  isSQL: (value: unknown) => boolean,
  dialect: DrizzleDialectInstance,
): string | undefined {
  if (column.default === undefined) return undefined;
  if (isSQL(column.default)) {
    // drizzle-kit itself only supports param-free `sql` default expressions
    // ("we don't support params for `sql` default values") — swallow
    // anything that doesn't stringify cleanly rather than surfacing a
    // confusing internal error for a display-only default value.
    try {
      return dialect.sqlToQuery(column.default, "indexes").sql;
    } catch {
      return undefined;
    }
  }
  if (column.default instanceof Date) return column.default.toISOString();
  if (typeof column.default === "object") return JSON.stringify(column.default);
  return String(column.default);
}

function collectPrimaryKeyColumnNames(
  tableConfig: DrizzleTableConfig,
  getColumnName: (column: DrizzleColumn) => string,
): Set<string> {
  const names = new Set<string>();
  for (const column of tableConfig.columns) {
    if (column.primary) names.add(getColumnName(column));
  }
  for (const pk of tableConfig.primaryKeys) {
    for (const column of pk.columns) names.add(getColumnName(column));
  }
  return names;
}

function collectSingleColumnUniqueNames(
  tableConfig: DrizzleTableConfig,
  getColumnName: (column: DrizzleColumn) => string,
): Set<string> {
  const names = new Set<string>();
  for (const column of tableConfig.columns) {
    if (column.isUnique) names.add(getColumnName(column));
  }
  for (const unique of tableConfig.uniqueConstraints) {
    if (unique.columns.length === 1) {
      names.add(getColumnName(unique.columns[0]));
    }
  }
  return names;
}

// Multi-column key/unique groupings a per-field boolean can't express.
// Single-column PK/unique stay on the field's isPrimaryKey/isUnique.
function extractCompositeKeys(
  tableConfig: DrizzleTableConfig,
  getColumnName: (column: DrizzleColumn) => string,
): { primaryKey?: string[]; uniques?: string[][] } {
  const pkNames = collectPrimaryKeyColumnNames(tableConfig, getColumnName);
  const uniques = tableConfig.uniqueConstraints
    .filter((u) => u.columns.length > 1)
    .map((u) => u.columns.map(getColumnName));

  return {
    primaryKey: pkNames.size > 1 ? Array.from(pkNames) : undefined,
    uniques: uniques.length > 0 ? uniques : undefined,
  };
}

// Plain (non-unique) indexes — unique ones are already carried via
// extractCompositeKeys/the per-field isUnique flag. A functional index's
// column entry is a raw SQL expression rather than an actual column.
function extractIndexes(
  tableConfig: DrizzleTableConfig,
  getColumnName: (column: DrizzleColumn) => string,
  isSQL: (value: unknown) => boolean,
  dialect: DrizzleDialectInstance,
): Index[] | undefined {
  const indexes = tableConfig.indexes
    .filter((idx) => !idx.config.unique)
    .map((idx) => ({
      fields: idx.config.columns.map((col) =>
        isSQL(col)
          ? dialect.sqlToQuery(col, "indexes").sql
          : getColumnName(col as DrizzleColumn),
      ),
      name: idx.config.name,
    }));

  return indexes.length > 0 ? indexes : undefined;
}

function buildEntity(
  name: string,
  tableConfig: DrizzleTableConfig,
  getColumnName: (column: DrizzleColumn) => string,
  isSQL: (value: unknown) => boolean,
  dialect: DrizzleDialectInstance,
): Entity {
  const fkColumnNames = new Set<string>();
  for (const fk of tableConfig.foreignKeys ?? []) {
    for (const column of fk.reference().columns) {
      fkColumnNames.add(getColumnName(column));
    }
  }
  const uniqueColumnNames = collectSingleColumnUniqueNames(
    tableConfig,
    getColumnName,
  );
  const pkColumnNames = collectPrimaryKeyColumnNames(
    tableConfig,
    getColumnName,
  );

  const fields: Field[] = tableConfig.columns.map((column) => {
    const columnName = getColumnName(column);
    const isPrimaryKey = pkColumnNames.has(columnName);
    return {
      name: columnName,
      type: toCanonicalType(column),
      nativeType: resolveNativeType(column, name, columnName),
      isPrimaryKey,
      isForeignKey: fkColumnNames.has(columnName),
      // Drizzle doesn't set notNull on primary keys, even though they're
      // always NOT NULL — same caveat as the Sequelize/TypeORM adapters.
      isNullable: isPrimaryKey ? false : !column.notNull,
      isUnique: uniqueColumnNames.has(columnName),
      defaultValue: resolveDefaultValue(column, isSQL, dialect),
      enumValues: column.enumValues,
    };
  });

  return {
    name,
    ...extractCompositeKeys(tableConfig, getColumnName),
    indexes: extractIndexes(tableConfig, getColumnName, isSQL, dialect),
    fields,
  };
}

// A FK column set that's fully covered by a unique constraint (or is itself
// a single unique/primary column) reads as a declared 1-1; anything else is
// the "many" side of a 1-n. Drizzle has no separate OneToOne/ManyToOne
// declaration to trust instead — same fallback the Sequelize adapter uses
// for an undeclared/ambiguous BelongsTo.
function isColumnSetUnique(
  tableConfig: DrizzleTableConfig,
  getColumnName: (column: DrizzleColumn) => string,
  columnNames: string[],
): boolean {
  if (columnNames.length === 1) {
    const column = tableConfig.columns.find(
      (c) => getColumnName(c) === columnNames[0],
    );
    if (column?.isUnique || column?.primary) return true;
  }
  const target = columnNames.toSorted().join(",");
  return tableConfig.uniqueConstraints.some(
    (u) => u.columns.map(getColumnName).toSorted().join(",") === target,
  );
}

export const drizzleAdapter: ORMAdapter = {
  name: "drizzle",

  async resolveEntry(input, cwd) {
    const absoluteInput = resolve(cwd, input);
    try {
      const stat = statSync(absoluteInput);
      if (!stat.isFile()) {
        throw new Error(`"${absoluteInput}" is not a file.`);
      }
      return { path: absoluteInput };
    } catch (err) {
      throw new Error(
        `Failed to load Drizzle entry from "${input}": ${(err as Error).message}. Check the --entry path or run without --entry to pick interactively.`,
        { cause: err },
      );
    }
  },

  async extract(entry: ResolvedEntry): Promise<ERDModel> {
    loadDotEnvFiles();

    const config = await loadDrizzleKitConfig(entry.path);
    const dialectInfo = DIALECT_MODULES[config.dialect];
    if (!dialectInfo) {
      throw new Error(
        `Drizzle dialect "${config.dialect}" isn't supported yet.`,
      );
    }

    const schemaFiles = resolveSchemaFiles(
      config.schema,
      dirname(entry.path),
      entry.path,
    );
    const schemaExports = await loadSchemaExports(schemaFiles);

    const drizzleOrm = requireFromTarget<DrizzleOrmModule>(
      entry.path,
      "drizzle-orm",
    );
    const casingModule = requireFromTarget<DrizzleCasingModule>(
      entry.path,
      "drizzle-orm/casing",
    );
    const dialectModule = requireFromTarget<DrizzleDialectModule>(
      entry.path,
      dialectInfo.specifier,
    );

    const TableClass = dialectModule[dialectInfo.tableExport];
    const DialectClass = dialectModule[
      dialectInfo.dialectExport
    ] as new (config?: { casing?: string }) => DrizzleDialectInstance;
    if (!TableClass || !DialectClass) {
      throw new Error(
        `Could not find "${dialectInfo.tableExport}"/"${dialectInfo.dialectExport}" exported from "${dialectInfo.specifier}" — this may be an unsupported drizzle-orm version.`,
      );
    }

    const dialectInstance = new DialectClass(
      config.casing ? { casing: config.casing } : undefined,
    );
    const isSQL = (value: unknown) => drizzleOrm.is(value, drizzleOrm.SQL);
    const getColumnName = (column: DrizzleColumn) =>
      resolveColumnName(column, config.casing, casingModule);

    const tables = Array.from(
      new Set(
        Object.values(schemaExports).filter((value) =>
          drizzleOrm.is(value, TableClass),
        ),
      ),
    );

    if (tables.length === 0) {
      throw new Error(
        `No ${config.dialect} tables were exported from [${schemaFiles.join(", ")}].`,
      );
    }

    const tableConfigs = tables.map((table) => ({
      name: drizzleOrm.getTableName(table),
      table,
      config: dialectModule.getTableConfig(table),
    }));

    const entities = tableConfigs.map(({ name, config: tableConfig }) =>
      buildEntity(name, tableConfig, getColumnName, isSQL, dialectInstance),
    );

    const tableConfigByInstance = new Map(
      tableConfigs.map((t) => [t.table, t]),
    );

    const relations: Relation[] = tableConfigs.flatMap(
      ({ name: childName, config: childConfig }) =>
        (childConfig.foreignKeys ?? []).map((fk): Relation => {
          const reference = fk.reference();
          const parentEntry = tableConfigByInstance.get(reference.foreignTable);
          const parentName =
            parentEntry?.name ??
            drizzleOrm.getTableName(reference.foreignTable);
          const toColumns = reference.columns.map(getColumnName);
          const fromColumns = reference.foreignColumns.map(getColumnName);

          return {
            from: parentName,
            to: childName,
            type: isColumnSetUnique(childConfig, getColumnName, toColumns)
              ? "1-1"
              : "1-n",
            fromColumn: fromColumns[0],
            toColumn: toColumns[0],
            onDelete: fk.onDelete as RelationAction | undefined,
            onUpdate: fk.onUpdate as RelationAction | undefined,
          };
        }),
    );

    return { entities, relations };
  },
};
