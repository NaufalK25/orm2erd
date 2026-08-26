import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
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
  MikroOrmCoreModule,
  MikroOrmEntityMetadata,
  MikroOrmEntityProperty,
  MikroOrmInstance,
  MikroOrmOptions,
} from "./types";

// Keyed by the built-in `types` registry's short names (see
// `@mikro-orm/core/types/index.js`) — `toCanonicalType` normalizes a
// declared `EntityProperty.type` (which can also come back as the `Type`
// subclass name, e.g. "DecimalType") by stripping a trailing "type" first.
const MIKRO_TYPE_TO_CANONICAL: Record<string, CanonicalType> = {
  string: "string",
  text: "string",
  character: "string",
  uuid: "string",
  integer: "int",
  smallint: "int",
  tinyint: "int",
  mediumint: "int",
  bigint: "bigint",
  float: "float",
  double: "float",
  decimal: "decimal",
  boolean: "boolean",
  date: "datetime",
  time: "datetime",
  datetime: "datetime",
  interval: "datetime",
  json: "json",
  blob: "bytes",
  uint8array: "bytes",
  enum: "enum",
  enumarray: "enum",
};

// Fallback tier keyed by the actual driver SQL type string
// (`EntityProperty.columnTypes[0]`), for when `type` doesn't match a known
// registry name (e.g. a custom `Type` subclass, or a plain string type like
// `"uuid"` that only round-trips through `columnTypes` as `"text"` on
// SQLite) — trimmed of any "(precision,scale)"/"(length)" suffix first.
const SQL_TYPE_TO_CANONICAL: Record<string, CanonicalType> = {
  varchar: "string",
  nvarchar: "string",
  char: "string",
  nchar: "string",
  text: "string",
  int: "int",
  int2: "int",
  int4: "int",
  integer: "int",
  smallint: "int",
  tinyint: "int",
  mediumint: "int",
  int8: "bigint",
  bigint: "bigint",
  float: "float",
  float4: "float",
  float8: "float",
  double: "float",
  "double precision": "float",
  real: "float",
  decimal: "decimal",
  numeric: "decimal",
  boolean: "boolean",
  bool: "boolean",
  date: "datetime",
  time: "datetime",
  datetime: "datetime",
  timestamp: "datetime",
  timestamptz: "datetime",
  "timestamp with time zone": "datetime",
  "timestamp without time zone": "datetime",
  json: "json",
  jsonb: "json",
  blob: "bytes",
  bytea: "bytes",
  binary: "bytes",
  varbinary: "bytes",
};

// Final fallback, keyed by `EntityProperty.runtimeType` — used only when
// neither `type` nor `columnTypes` resolved to anything recognizable.
const RUNTIME_TYPE_TO_CANONICAL: Record<string, CanonicalType> = {
  number: "int",
  string: "string",
  boolean: "boolean",
  bigint: "bigint",
  Buffer: "bytes",
  Date: "datetime",
  object: "json",
};

function toCanonicalType(prop: MikroOrmEntityProperty): CanonicalType {
  if (prop.enum) return "enum";

  const declared = prop.type?.toLowerCase().replace(/type$/, "");
  if (declared && declared in MIKRO_TYPE_TO_CANONICAL) {
    return MIKRO_TYPE_TO_CANONICAL[declared];
  }

  const sqlBase = prop.columnTypes?.[0]
    ?.toLowerCase()
    .replace(/\(.*$/, "")
    .trim();
  if (sqlBase && sqlBase in SQL_TYPE_TO_CANONICAL) {
    return SQL_TYPE_TO_CANONICAL[sqlBase];
  }

  return prop.runtimeType && prop.runtimeType in RUNTIME_TYPE_TO_CANONICAL
    ? RUNTIME_TYPE_TO_CANONICAL[prop.runtimeType]
    : "unknown";
}

function nativeTypeName(prop: MikroOrmEntityProperty): string {
  return prop.columnTypes?.[0] ?? prop.type ?? prop.runtimeType ?? "unknown";
}

// Already close to the IR's own spelling (unlike TypeORM's uppercase
// `CASCADE`/`SET NULL` forms) — this is mostly a pass-through, normalizing
// case and dropping anything unrecognized.
const MIKRO_ACTION_TO_CANONICAL: Record<string, RelationAction> = {
  cascade: "cascade",
  restrict: "restrict",
  "set null": "set null",
  "no action": "no action",
  "set default": "set default",
};

function toRelationAction(
  rule: string | undefined,
): RelationAction | undefined {
  return rule ? MIKRO_ACTION_TO_CANONICAL[rule.toLowerCase()] : undefined;
}

function resolveDefaultValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resolvePropertyList(
  properties: string | string[] | undefined,
): string[] {
  if (!properties) return [];
  return Array.isArray(properties) ? properties : [properties];
}

// Column-level `@Property({ unique: true })` already lives on the property
// itself (`prop.unique`); entity-level `@Unique({ properties: [...] })`
// declarations instead land in `meta.uniques` — single-column entries there
// mark that field unique too, multi-column ones become `Entity.uniques`.
function collectSingleColumnUniqueNames(
  meta: MikroOrmEntityMetadata,
): Set<string> {
  const names = new Set<string>();
  for (const unique of meta.uniques) {
    const props = resolvePropertyList(unique.properties);
    if (props.length === 1) names.add(props[0]);
  }
  return names;
}

function buildScalarField(
  prop: MikroOrmEntityProperty,
  singleColumnUniqueNames: Set<string>,
): Field {
  const fieldName = prop.fieldNames?.[0];
  return {
    name: prop.name,
    columnName: fieldName && fieldName !== prop.name ? fieldName : undefined,
    type: toCanonicalType(prop),
    nativeType: nativeTypeName(prop),
    isList: prop.array,
    isPrimaryKey: prop.primary,
    isNullable: prop.primary ? false : prop.nullable,
    isUnique: Boolean(prop.unique) || singleColumnUniqueNames.has(prop.name),
    defaultValue: resolveDefaultValue(prop.default),
    enumValues: prop.enum ? prop.items?.map(String) : undefined,
    description: prop.comment,
  };
}

// MikroORM never exposes an owning relation's physical FK column(s) as
// their own scalar `EntityProperty` the way TypeORM does (there's no
// synthetic "authorId" property here — `author`/`fieldNames: ['author_id']`
// IS the relation) — synthesized here instead, so the FK column still shows
// up as a real field the way it does for every other adapter. Typed off the
// referenced entity's own PK field(s), paired positionally with
// `referencedColumnNames`.
function buildForeignKeyFields(prop: MikroOrmEntityProperty): Field[] {
  const fieldNames = prop.fieldNames ?? [];
  const referencedColumnNames = prop.referencedColumnNames ?? [];

  return fieldNames.map((fieldName, i) => {
    const referencedColumnName = referencedColumnNames[i];
    const referencedProp = referencedColumnName
      ? prop.targetMeta?.props.find((p) =>
          p.fieldNames?.includes(referencedColumnName),
        )
      : undefined;

    return {
      name: fieldName,
      type: referencedProp ? toCanonicalType(referencedProp) : "int",
      nativeType: referencedProp ? nativeTypeName(referencedProp) : "unknown",
      isForeignKey: true,
      isNullable: prop.nullable,
    };
  });
}

// Plain (non-unique) indexes — unique ones are already carried via
// `collectSingleColumnUniqueNames`/`Entity.uniques`.
function extractIndexes(meta: MikroOrmEntityMetadata): Index[] | undefined {
  const indexes = meta.indexes
    .map((idx) => ({
      fields: resolvePropertyList(idx.properties),
      name: idx.name,
    }))
    .filter((idx) => idx.fields.length > 0);
  return indexes.length > 0 ? indexes : undefined;
}

function extractMultiColumnUniques(
  meta: MikroOrmEntityMetadata,
): string[][] | undefined {
  const uniques = meta.uniques
    .map((u) => resolvePropertyList(u.properties))
    .filter((props) => props.length > 1);
  return uniques.length > 0 ? uniques : undefined;
}

// MikroORM flattens `@Embedded()` properties into `meta.props` itself before
// the adapter ever sees them, but the two embedding modes leave opposite
// traces: an inline embeddable (the default) has no column of its own
// (`columnTypes: []`) — only its already-flattened leaf properties
// (`kind: "scalar"`, real prefixed `fieldNames`) are physical, so the plain
// `kind === "scalar"` filter already picks those up correctly. An
// `{ object: true }` embeddable is the reverse: the wrapper prop itself
// (`kind: "embedded"`, `object: true`) is the one physical JSON column, and
// MikroORM additionally synthesizes a `persist: false` scalar mirror per
// embedded field (named `wrapper~field`) purely for JSON-path querying —
// those must be excluded or they'd show up as bogus extra columns.
function buildEntity(meta: MikroOrmEntityMetadata): Entity {
  const singleColumnUniqueNames = collectSingleColumnUniqueNames(meta);
  const scalarFields = meta.props
    .filter(
      (p) =>
        p.persist !== false &&
        (p.kind === "scalar" || (p.kind === "embedded" && p.object)),
    )
    .map((p) => buildScalarField(p, singleColumnUniqueNames));
  // Only m:1/1:1 owning props carry a *physical* FK column — an owning m:n
  // prop's `fieldNames` is just a bookkeeping echo of its own property name,
  // not a real column on this table (the join lives in the pivot table).
  const fkFields = meta.props
    .filter(
      (p) =>
        (p.kind === "m:1" || p.kind === "1:1") &&
        p.owner &&
        p.fieldNames?.length,
    )
    .flatMap(buildForeignKeyFields);

  return {
    name: meta.className,
    tableName: meta.collection !== meta.className ? meta.collection : undefined,
    fields: [...scalarFields, ...fkFields],
    description: meta.comment,
    primaryKey: meta.compositePK ? meta.primaryKeys : undefined,
    uniques: extractMultiColumnUniques(meta),
    indexes: extractIndexes(meta),
  };
}

// One `EntityProperty` exists per declared side (e.g. `User.posts` and
// `Post.author` are two separate properties paired via `mappedBy`/
// `inversedBy`) — each case below emits from exactly one side to avoid
// double-counting a pair, mirroring the TypeORM adapter's
// `.inverseRelation`-based dedup (`src/adapters/typeorm/index.ts`).
function buildRelation(
  meta: MikroOrmEntityMetadata,
  prop: MikroOrmEntityProperty,
): Relation | undefined {
  const relatedName = prop.targetMeta?.className ?? prop.type;

  switch (prop.kind) {
    case "1:m": {
      // The FK column — and any deleteRule/updateRule, which only live on
      // the owning m:1 side — belongs to the paired property `mappedBy`
      // names on the target entity, if declared.
      const owningProp = prop.targetMeta?.props.find(
        (p) => p.name === prop.mappedBy,
      );
      return {
        from: meta.className,
        to: relatedName,
        type: "1-n",
        fieldName: prop.name,
        fromColumn: meta.primaryKeys[0],
        toColumn: owningProp?.fieldNames?.[0],
        isFromOptional: owningProp?.nullable,
        onDelete: toRelationAction(owningProp?.deleteRule),
        onUpdate: toRelationAction(owningProp?.updateRule),
      };
    }
    case "m:1": {
      // Already covered from the "one" side above when a paired `1:m`
      // property exists (signaled by `inversedBy`) — only emit standalone
      // otherwise.
      if (prop.inversedBy) return undefined;
      return {
        from: relatedName,
        to: meta.className,
        type: "1-n",
        fromColumn: prop.targetMeta?.primaryKeys[0],
        toColumn: prop.fieldNames?.[0],
        isFromOptional: prop.nullable,
        onDelete: toRelationAction(prop.deleteRule),
        onUpdate: toRelationAction(prop.updateRule),
      };
    }
    case "1:1": {
      // Owning side carries the join column — swapped into `to` so the FK
      // always lives there, matching the 1-n cases above. `fieldName`
      // follows that swap: it names the alias on `from`, which is the
      // inverse property. Falls back to this side's own name when no
      // inverse is declared — the only alias that exists then.
      if (!prop.owner) return undefined;
      return {
        from: relatedName,
        to: meta.className,
        type: "1-1",
        fieldName: prop.inversedBy ?? prop.name,
        fromColumn: prop.targetMeta?.primaryKeys[0],
        toColumn: prop.fieldNames?.[0],
        isFromOptional: prop.nullable,
        onDelete: toRelationAction(prop.deleteRule),
        onUpdate: toRelationAction(prop.updateRule),
      };
    }
    case "m:n": {
      // Owning side carries the pivot table; the inverse side is the same
      // pair seen from the other direction.
      if (!prop.owner) return undefined;
      return {
        from: meta.className,
        to: relatedName,
        type: "n-n",
        fieldName: prop.name,
      };
    }
    // "embedded" is the only other kind reaching this switch (`buildModel`
    // only excludes "scalar") — never a relation. Its physical-column case
    // (`object: true`) is handled as a field in `buildEntity` instead; the
    // non-object case has no column of its own at all.
    default:
      return undefined;
  }
}

// MikroORM itself already throws `MetadataError.noEntityDiscovered()` — "No
// entities were discovered" — during `MikroORM.init()` whenever zero
// entities are found, so there's no zero-entities case left to guard here:
// by the time `buildModel` runs, at least one *real* entity necessarily
// exists (a pivot-table's presence in `allMetadata` already implies its two
// owning entities are in there too), so filtering out pivot tables can never
// leave this empty.
function buildModel(allMetadata: MikroOrmEntityMetadata[]): ERDModel {
  // MikroORM's own synthesized implicit m:n pivot-table metadata — never a
  // real user-declared entity (see the comment on `pivotTable` in types.ts).
  const entityMetadatas = allMetadata.filter((m) => !m.pivotTable);

  const entities = entityMetadatas.map(buildEntity);
  const relations = entityMetadatas
    .flatMap((meta) =>
      meta.props
        .filter((p) => p.kind !== "scalar")
        .map((p) => buildRelation(meta, p)),
    )
    .filter((relation): relation is Relation => relation !== undefined);

  return { entities, relations };
}

function looksLikeMikroOrmOptions(value: unknown): value is MikroOrmOptions {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.entities) ||
    Array.isArray(v.entitiesTs) ||
    v.driver !== undefined
  );
}

function looksLikeMikroOrmInstance(value: unknown): value is MikroOrmInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MikroOrmInstance).getMetadata === "function"
  );
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

// Loads the target's own config file export — either a MikroORM options
// object (the standard `mikro-orm.config.ts` convention, usually built with
// `defineConfig()`) or an already-initialized instance/promise (a bootstrap
// file that calls `MikroORM.init(...)` itself and exports the result).
// Tolerates one level of double-wrapped default export, same as the
// Drizzle adapter's config loader (`src/adapters/drizzle/index.ts`).
async function resolveConfigExport(entryPath: string): Promise<unknown> {
  globalThis.require = createRequire(entryPath);
  globalThis.__filename = entryPath;
  globalThis.__dirname = dirname(entryPath);

  const mod = await tsImport(pathToFileURL(entryPath).href, import.meta.url);
  const outer = (mod as { default?: unknown }).default ?? mod;
  let resolved = isThenable(outer) ? await outer : outer;

  if (
    !looksLikeMikroOrmOptions(resolved) &&
    !looksLikeMikroOrmInstance(resolved)
  ) {
    const inner = (resolved as { default?: unknown } | undefined)?.default;
    resolved = isThenable(inner) ? await inner : (inner ?? resolved);
  }

  return resolved;
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

interface TscBuild {
  outDir: string;
  projectRoot: string;
}

// MikroORM's classic decorators (`@Property`, `@ManyToOne`, ...) expect
// TypeScript's legacy `experimentalDecorators` calling convention, and any
// property without an explicit `type`/`entity` option relies on
// `emitDecoratorMetadata`-emitted `design:type` reflection to infer it
// (MikroORM's default `ReflectMetadataProvider`) — esbuild (which `tsImport`
// uses) doesn't emit that metadata at all, so MikroORM throws a clear
// "provide either 'type' or 'entity' attribute" error for exactly those
// properties. Compiling with the target's own installed `typescript` + its
// tsconfig.json first (real `tsc`, forcing both flags on) sidesteps this —
// same fix, and same reasoning, as the TypeORM adapter's `runTargetTsc`.
// Harmless to run even for decorator-free `defineEntity()`/`EntitySchema`
// code, which has no decorators to reinterpret.
function runTargetTsc(fromDir: string): TscBuild {
  const tsconfigPath = findNearestTsconfig(fromDir);
  if (!tsconfigPath) {
    throw new Error(
      `Could not find a tsconfig.json above "${fromDir}" to compile MikroORM's decorated entities with — needed because MikroORM's decorators don't run correctly under orm2erd's lightweight TS transform (it can't emit "emitDecoratorMetadata"). Add a tsconfig.json, or point --entry at already-compiled JS entities instead.`,
    );
  }
  const projectRoot = dirname(tsconfigPath);

  const targetRequire = createRequire(fromDir + "/");
  let tscBinPath: string;
  try {
    tscBinPath = join(
      dirname(targetRequire.resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
  } catch (err) {
    throw new Error(
      `Could not resolve "typescript" from "${fromDir}" — it's needed to compile MikroORM's decorated entities correctly. Install it in the target project, or point --entry at already-compiled JS entities instead.`,
      { cause: err },
    );
  }

  // Created inside the target project (not the system temp dir) so Node's
  // usual upward node_modules search still finds the target's own installed
  // packages (@mikro-orm/core, reflect-metadata, ...) once the compiled
  // output is discovered/imported.
  const outDir = mkdtempSync(join(projectRoot, ".orm2erd-mikroorm-build-"));
  // Force CommonJS output and pin it with our own package.json, regardless
  // of what the nearest real ancestor package.json says — same reasoning as
  // the TypeORM adapter's identical fix.
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
        "--experimentalDecorators",
        "--emitDecoratorMetadata",
      ],
      { stdio: "pipe" },
    );
  } catch (err) {
    // noEmitOnError defaults to false, so tsc still emits output even when
    // the target project has unrelated type errors elsewhere — best-effort,
    // same as the TypeORM adapter.
    void err;
  }

  return { outDir, projectRoot };
}

function mapDirToCompiledPath(originalDir: string, build: TscBuild): string {
  return join(build.outDir, relative(build.projectRoot, originalDir));
}

export const mikroormAdapter: ORMAdapter = {
  name: "mikroorm",

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
        `Failed to load MikroORM entry from "${input}": ${(err as Error).message}. Check the --entry path or run without --entry to pick interactively.`,
        { cause: err },
      );
    }
  },

  async extract(entry: ResolvedEntry): Promise<ERDModel> {
    loadDotEnvFiles();

    const targetRequire = createRequire(entry.path);
    const core = targetRequire("@mikro-orm/core") as MikroOrmCoreModule;

    // Routes MikroORM's own folder-based entity discovery through orm2erd's
    // tsx-based loader instead of a plain `import()` — needed even before
    // we know the config shape, since the entry module itself (or code it
    // eagerly calls) may trigger discovery as a side effect.
    const importer = (id: string) =>
      tsImport(id, pathToFileURL(entry.path).href);
    core.Utils.dynamicImportProvider = importer;
    (globalThis as { dynamicImportProvider?: unknown }).dynamicImportProvider =
      importer;

    const resolved = await resolveConfigExport(entry.path);

    let orm: MikroOrmInstance;

    if (looksLikeMikroOrmInstance(resolved)) {
      // The entry file already called `MikroORM.init(...)` itself and
      // exported the result — we can't force `connect: false`/`preferTs`
      // for this path, so it depends on the target's own call already
      // being safe to run without a reachable database.
      orm = resolved;
    } else if (looksLikeMikroOrmOptions(resolved)) {
      const baseDir = resolved.baseDir
        ? resolve(dirname(entry.path), resolved.baseDir)
        : dirname(entry.path);

      const tsEntries = (resolved.entitiesTs ?? []).filter(
        (e): e is string => typeof e === "string",
      );
      const jsEntries = (resolved.entities ?? []).filter(
        (e): e is string => typeof e === "string",
      );
      const alreadyResolvedEntities = [
        ...(resolved.entities ?? []),
        ...(resolved.entitiesTs ?? []),
      ].filter((e) => typeof e !== "string");

      // v6 has no standalone public "discover these paths for me" helper
      // (that's a v7 addition) — instead, directory-path strings are passed
      // straight into `entities` and MikroORM's own `MikroORM.init()` does
      // the folder scan internally via `Utils.dynamicImport`, which we've
      // already routed through `tsImport` above.
      let tscBuild: TscBuild | undefined;
      const entityPathsOrClasses: unknown[] = [...alreadyResolvedEntities];

      try {
        if (tsEntries.length > 0) {
          tscBuild = runTargetTsc(resolve(baseDir, tsEntries[0]));
          try {
            targetRequire("reflect-metadata");
          } catch {
            // Optional — only needed by decorators relying on implicit
            // (emitDecoratorMetadata-inferred) property types.
          }
          entityPathsOrClasses.push(
            ...tsEntries.map((dir) =>
              mapDirToCompiledPath(resolve(baseDir, dir), tscBuild!),
            ),
          );
        } else {
          entityPathsOrClasses.push(
            ...jsEntries.map((dir) => resolve(baseDir, dir)),
          );
        }

        orm = await core.MikroORM.init({
          ...resolved,
          entities: entityPathsOrClasses,
          entitiesTs: undefined,
          connect: false,
          preferTs: false,
          baseDir,
        });
      } finally {
        if (tscBuild) rmSync(tscBuild.outDir, { recursive: true, force: true });
      }
    } else {
      throw new Error(
        `"${entry.path}" doesn't export a MikroORM config or instance — expected a default export shaped like \`defineConfig({ entities: [...], entitiesTs: [...] })\` (or a plain object with an "entities"/"entitiesTs"/"driver" field), or an already-initialized \`MikroORM.init(...)\` call.`,
      );
    }

    // v6's `getAll()` returns a plain `Dictionary<EntityMetadata>`; v7's
    // returns a real `Map<string, EntityMetadata>` — the only runtime
    // behavior difference between the two versions this adapter has to
    // account for (confirmed by reading each version's compiled
    // MetadataStorage.js, not assumed from either's .d.ts).
    const all = orm.getMetadata().getAll();
    const allMetadata =
      all instanceof Map
        ? [...all.values()]
        : Object.values(all as Record<string, MikroOrmEntityMetadata>);
    return buildModel(allMetadata);
  },
};
