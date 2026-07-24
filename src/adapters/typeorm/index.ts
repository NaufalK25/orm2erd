import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import type { ORMAdapter, ResolvedEntry } from "../types";
import type {
  CanonicalType,
  Entity,
  ERDModel,
  Field,
  Relation,
} from "../../core/model";
import { loadDotEnvFiles } from "../../core/dotenv";
import type {
  TypeOrmColumnMetadata,
  TypeOrmConnectionMetadataBuilderCtor,
  TypeOrmDataSourceInstance,
  TypeOrmEntityMetadata,
  TypeOrmRelationMetadata,
} from "./types";

const TYPEORM_TYPE_TO_CANONICAL: Record<string, CanonicalType> = {
  varchar: "string",
  char: "string",
  nvarchar: "string",
  nchar: "string",
  text: "string",
  tinytext: "string",
  mediumtext: "string",
  longtext: "string",
  ntext: "string",
  uuid: "string",
  "simple-array": "string",
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
  real: "float",
  double: "float",
  "double precision": "float",
  decimal: "decimal",
  numeric: "decimal",
  dec: "decimal",
  boolean: "boolean",
  bool: "boolean",
  date: "datetime",
  datetime: "datetime",
  datetime2: "datetime",
  time: "datetime",
  timetz: "datetime",
  timestamp: "datetime",
  "timestamp with time zone": "datetime",
  "timestamp without time zone": "datetime",
  json: "json",
  jsonb: "json",
  "simple-json": "json",
  blob: "bytes",
  tinyblob: "bytes",
  mediumblob: "bytes",
  longblob: "bytes",
  binary: "bytes",
  varbinary: "bytes",
  bytea: "bytes",
  enum: "enum",
};

function toCanonicalType(columnType: string | Function): CanonicalType {
  if (typeof columnType === "string") {
    return TYPEORM_TYPE_TO_CANONICAL[columnType.toLowerCase()] ?? "unknown";
  }
  // Implicit types inferred from the property's TS design:type — columns
  // TypeORM couldn't (or wasn't asked to) normalize into a driver-specific
  // string, e.g. `@Column() flag: boolean` with no explicit `type` option.
  switch (columnType) {
    case String:
      return "string";
    case Number:
      return "int";
    case Boolean:
      return "boolean";
    case Date:
      return "datetime";
    default:
      return "unknown";
  }
}

function nativeTypeName(columnType: string | Function): string {
  return typeof columnType === "string" ? columnType : columnType.name;
}

function resolveDefaultValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "function") return `${value.name || "(function)"}()`;
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function looksLikeTypeOrmDataSource(
  value: unknown,
): value is TypeOrmDataSourceInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TypeOrmDataSourceInstance).options === "object" &&
    (value as TypeOrmDataSourceInstance).options !== null &&
    (value as TypeOrmDataSourceInstance).driver !== undefined
  );
}

// Export shapes vary (named export, default export, CJS interop), so search
// a few levels deep instead of guessing paths — same approach as the
// Sequelize adapter's findSequelizeInstance.
const MAX_DATASOURCE_SEARCH_DEPTH = 3;

function findDataSourceInstance(
  value: unknown,
  depth = 0,
): TypeOrmDataSourceInstance | undefined {
  if (looksLikeTypeOrmDataSource(value)) return value;
  if (depth >= MAX_DATASOURCE_SEARCH_DEPTH) return undefined;
  if (typeof value !== "object" || value === null) return undefined;

  for (const nested of Object.values(value)) {
    const found = findDataSourceInstance(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function loadDataSourceInstance(
  path: string,
): Promise<TypeOrmDataSourceInstance> {
  // Polyfill CJS globals (tsImport loads files as ESM, where none of these
  // exist) — mirrors the Sequelize/Mongoose adapters' own entry loaders.
  globalThis.require = createRequire(path);
  globalThis.__filename = path;
  globalThis.__dirname = dirname(path);

  const mod = await tsImport(pathToFileURL(path).href, import.meta.url);
  const candidate = findDataSourceInstance(mod);
  if (!candidate) {
    throw new Error(
      `Could not find a TypeORM DataSource exported from "${path}". Export it (e.g. "export const AppDataSource = new DataSource(...)").`,
    );
  }
  return candidate;
}

const TS_ENTRY_PATTERN = /\.(ts|mts|cts)$/i;

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

// TypeORM's decorators (@Column, @PrimaryGeneratedColumn, etc.) expect
// TypeScript's legacy `experimentalDecorators` calling convention and often
// rely on `emitDecoratorMetadata`-emitted design:type/paramtypes reflection
// to infer column types. esbuild — which tsImport uses under the hood —
// doesn't support emitDecoratorMetadata at all (deliberately out of scope,
// per the esbuild maintainers) and doesn't correctly emulate the legacy
// calling convention either, so importing a raw .ts entity file directly
// crashes inside TypeORM's own decorator code. Compiling with the target
// project's own installed `typescript` + its own tsconfig.json first (real
// tsc, not orm2erd's lightweight transform) sidesteps this entirely — used
// both for a .ts entry file itself and for any .ts glob in `entities`
// (rewriteEntityGlobs below).
function runTargetTsc(fromPath: string): TscBuild {
  const tsconfigPath = findNearestTsconfig(dirname(fromPath));
  if (!tsconfigPath) {
    throw new Error(
      `Could not find a tsconfig.json above "${fromPath}" to compile TypeORM's decorated entities with — needed because TypeORM's decorators don't run correctly under orm2erd's lightweight TS transform (it can't emit "emitDecoratorMetadata"). Add a tsconfig.json, or point --entry at already-compiled JS output instead.`,
    );
  }
  const projectRoot = dirname(tsconfigPath);

  const targetRequire = createRequire(fromPath);
  let tscBinPath: string;
  try {
    tscBinPath = join(
      dirname(targetRequire.resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
  } catch (err) {
    throw new Error(
      `Could not resolve "typescript" from "${fromPath}" — it's needed to compile TypeORM's decorated entities correctly. Install it in the target project, or point --entry at already-compiled JS output instead.`,
      { cause: err },
    );
  }

  // Created inside the target project (not the system temp dir) so Node's
  // usual upward node_modules search still finds the target's own installed
  // packages (typeorm, reflect-metadata, ...) when the compiled output is
  // later imported — a temp dir elsewhere would resolve against nothing.
  const outDir = mkdtempSync(join(projectRoot, ".orm2erd-typeorm-build-"));
  // Force CommonJS output (loadDataSourceInstance/TypeORM's own glob
  // importer both use plain require()) and pin it with our own
  // package.json, regardless of what the nearest real ancestor package.json
  // says — outDir has none of its own, so without this, Node would fall
  // back to whatever "type" the target project (or, for a fixture with no
  // package.json at all, some further ancestor) happens to declare, and
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
      ],
      { stdio: "pipe" },
    );
  } catch (err) {
    // noEmitOnError defaults to false, so tsc still emits output even when
    // the target project has unrelated type errors elsewhere in its
    // tsconfig's include — treat this as best-effort and let the caller
    // decide whether what it needed actually got emitted.
    void err;
  }

  return { outDir, projectRoot };
}

function mapToCompiledPath(originalPath: string, build: TscBuild): string {
  return join(build.outDir, relative(build.projectRoot, originalPath)).replace(
    TS_ENTRY_PATTERN,
    ".js",
  );
}

// A DataSource's `entities` array can mix classes with glob-path strings
// (e.g. "src/entity/**/*.ts") — TypeORM resolves those itself inside
// ConnectionMetadataBuilder via a plain require() per matched file, which
// can't load raw .ts any more than importing one directly can. Rewriting
// each glob to point at the tsc-compiled mirror (same relative layout,
// enforced by --rootDir in runTargetTsc) fixes this without needing to
// hand-roll glob resolution ourselves — TypeORM still does that part.
function rewriteEntityGlobs(entities: unknown[], build: TscBuild): unknown[] {
  return entities.map((entity) => {
    if (typeof entity !== "string") return entity;
    const absoluteGlob = resolve(build.projectRoot, entity);
    const rel = relative(build.projectRoot, absoluteGlob);
    if (rel.startsWith("..")) return entity; // outside the project root — leave as-is
    return join(build.outDir, rel).replace(/\.ts$/, ".js");
  });
}

const LEGACY_ORMCONFIG_PATTERN = /^ormconfig\.(json|js|ts|yml|yaml|xml)$/i;

function loadLegacyConnectionOptions(path: string): unknown {
  const ext = extname(path).slice(1).toLowerCase();
  if (ext !== "json") {
    throw new Error(
      `Legacy "${basename(path)}" isn't supported yet — only JSON ormconfig files are. Convert it to ormconfig.json, or migrate the project to a 0.3+/1.x DataSource file.`,
    );
  }

  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  const options = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!options || typeof options !== "object") {
    throw new Error(`"${path}" doesn't define any connection options.`);
  }
  return options;
}

// TypeORM 0.2.x has no DataSource class at all — createConnection() reads
// this ormconfig implicitly. Building an instance ourselves from the parsed
// options, without ever calling .connect()/.initialize(), is what lets
// metadata building stay DB-connection-free for legacy projects too.
function createUnconnectedInstance(
  typeormModule: Record<string, unknown>,
  options: unknown,
): TypeOrmDataSourceInstance {
  const DataSourceCtor = typeormModule.DataSource as
    (new (options: unknown) => TypeOrmDataSourceInstance) | undefined;
  const ConnectionCtor = typeormModule.Connection as
    (new (options: unknown) => TypeOrmDataSourceInstance) | undefined;
  const Ctor = DataSourceCtor ?? ConnectionCtor;
  if (!Ctor) {
    throw new Error(
      "Could not find a DataSource or Connection constructor exported from the installed typeorm package.",
    );
  }
  return new Ctor(options);
}

// ConnectionMetadataBuilder builds full entity/column/relation metadata
// purely from decorator args, with no DB connection involved — the same
// internal building block TypeORM itself uses inside
// DataSource#initialize()/Connection#connect() before it ever opens a real
// connection. It isn't part of the public API, so it's deep-imported by
// resolved absolute path (bypassing the installed package's "exports" map
// entirely, since that only governs bare-specifier resolution) rather than
// via a "typeorm/connection/..." specifier. Same class name and constructor
// shape across 0.2.x–1.x — verified against the published source for each.
function loadConnectionMetadataBuilderClass(
  fromPath: string,
): TypeOrmConnectionMetadataBuilderCtor {
  const targetRequire = createRequire(fromPath);
  let typeormEntryPath: string;
  try {
    typeormEntryPath = targetRequire.resolve("typeorm");
  } catch (err) {
    throw new Error(
      `Could not resolve "typeorm" from "${fromPath}" — is it installed in the target project?`,
      { cause: err },
    );
  }

  const builderPath = join(
    dirname(typeormEntryPath),
    "connection",
    "ConnectionMetadataBuilder.js",
  );
  if (!existsSync(builderPath)) {
    throw new Error(
      `Could not find TypeORM's internal ConnectionMetadataBuilder at "${builderPath}". This adapter relies on TypeORM's own metadata-building internals, which may have moved in the installed version.`,
    );
  }

  return (
    targetRequire(builderPath) as {
      ConnectionMetadataBuilder: TypeOrmConnectionMetadataBuilderCtor;
    }
  ).ConnectionMetadataBuilder;
}

function collectForeignKeyColumnNames(
  entityMetadata: TypeOrmEntityMetadata,
): Set<string> {
  const names = new Set<string>();
  for (const relation of entityMetadata.relations) {
    for (const column of relation.joinColumns) {
      names.add(column.propertyName);
    }
  }
  return names;
}

function collectUniqueColumnNames(
  entityMetadata: TypeOrmEntityMetadata,
): Set<string> {
  const names = new Set<string>();
  for (const unique of entityMetadata.uniques) {
    if (unique.columns.length === 1) {
      names.add(unique.columns[0].propertyName);
    }
  }
  return names;
}

function buildField(
  column: TypeOrmColumnMetadata,
  fkColumnNames: Set<string>,
  uniqueColumnNames: Set<string>,
): Field {
  return {
    name: column.propertyName,
    type: toCanonicalType(column.type),
    nativeType: nativeTypeName(column.type),
    isPrimaryKey: column.isPrimary,
    isForeignKey: fkColumnNames.has(column.propertyName),
    // TypeORM doesn't set isNullable on primary keys, even though they're
    // always NOT NULL — same caveat as the Sequelize adapter.
    isNullable: column.isPrimary ? false : column.isNullable,
    isUnique: uniqueColumnNames.has(column.propertyName),
    defaultValue: resolveDefaultValue(column.default),
    enumValues: column.enum?.map(String),
    description: column.comment,
  };
}

// Multi-column key/unique groupings a per-column flag can't express.
// Single-column PK/unique stay on the field's isPrimaryKey/isUnique.
function extractCompositeKeys(entityMetadata: TypeOrmEntityMetadata): {
  primaryKey?: string[];
  uniques?: string[][];
} {
  const pk = entityMetadata.primaryColumns.map((c) => c.propertyName);
  const uniques = entityMetadata.uniques
    .filter((u) => u.columns.length > 1)
    .map((u) => u.columns.map((c) => c.propertyName));

  return {
    primaryKey: pk.length > 1 ? pk : undefined,
    uniques: uniques.length > 0 ? uniques : undefined,
  };
}

function buildEntity(entityMetadata: TypeOrmEntityMetadata): Entity {
  const fkColumnNames = collectForeignKeyColumnNames(entityMetadata);
  const uniqueColumnNames = collectUniqueColumnNames(entityMetadata);
  return {
    name: entityMetadata.name,
    ...extractCompositeKeys(entityMetadata),
    description: entityMetadata.comment,
    fields: entityMetadata.columns.map((column) =>
      buildField(column, fkColumnNames, uniqueColumnNames),
    ),
  };
}

// One relation object exists per declared side (e.g. User.posts and
// Post.author are two separate RelationMetadata instances paired via
// .inverseRelation) — each case below emits from exactly one side to avoid
// double-counting a pair, using .inverseRelation itself as the dedup
// signal instead of a separate seen-set.
function buildRelation(
  entityMetadata: TypeOrmEntityMetadata,
  relation: TypeOrmRelationMetadata,
): Relation | undefined {
  const relatedName = relation.inverseEntityMetadata.name;

  switch (relation.relationType) {
    case "one-to-many": {
      // The declaring entity is the "one" side; the FK column physically
      // lives on the paired many-to-one (owning) side, if declared.
      const owningSide = relation.inverseRelation;
      return {
        from: entityMetadata.name,
        to: relatedName,
        type: "1-n",
        fieldName: relation.propertyName,
        fromColumn: entityMetadata.primaryColumns[0]?.propertyName,
        toColumn: owningSide?.joinColumns[0]?.propertyName,
      };
    }
    case "many-to-one": {
      // Already covered from the "one" side above when a @OneToMany
      // back-reference exists — only emit standalone otherwise.
      if (relation.inverseRelation) return undefined;
      return {
        from: relatedName,
        to: entityMetadata.name,
        type: "1-n",
        fromColumn:
          relation.inverseEntityMetadata.primaryColumns[0]?.propertyName,
        toColumn: relation.joinColumns[0]?.propertyName,
      };
    }
    case "one-to-one": {
      // Owning side carries @JoinColumn — same "owner = FK-holding side"
      // convention as the Sequelize adapter.
      if (!relation.isOwning) return undefined;
      return {
        from: entityMetadata.name,
        to: relatedName,
        type: "1-1",
        fieldName: relation.propertyName,
        fromColumn: relation.joinColumns[0]?.propertyName,
        toColumn:
          relation.inverseEntityMetadata.primaryColumns[0]?.propertyName,
      };
    }
    case "many-to-many": {
      // Owning side carries @JoinTable; the inverse side is the same pair
      // seen from the other direction.
      if (!relation.isOwning) return undefined;
      return {
        from: entityMetadata.name,
        to: relatedName,
        type: "n-n",
        fieldName: relation.propertyName,
      };
    }
    default:
      return undefined;
  }
}

export const typeormAdapter: ORMAdapter = {
  name: "typeorm",

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
        `Failed to load TypeORM entry from "${input}": ${(err as Error).message}. Check the --entry path or run without --entry to pick interactively.`,
        { cause: err },
      );
    }
  },

  async extract(entry: ResolvedEntry): Promise<ERDModel> {
    loadDotEnvFiles();

    const isLegacyOrmconfig = LEGACY_ORMCONFIG_PATTERN.test(
      basename(entry.path),
    );

    let dataSourceLike: TypeOrmDataSourceInstance;
    // Set once a tsc build has been used, whether for the entry file itself
    // (.ts DataSource files) or only for rewriting glob entities below —
    // cleaned up in the finally block below, which wraps every use of it
    // (not just the last one) so a failure partway through can't leak it.
    let tscBuild: TscBuild | undefined;
    let allEntityMetadatas: TypeOrmEntityMetadata[];

    try {
      if (isLegacyOrmconfig) {
        // Validate/parse the config before ever touching module resolution
        // — argument evaluation order would otherwise let a missing
        // "typeorm" installation mask a clearer "unsupported format" error.
        const legacyOptions = loadLegacyConnectionOptions(entry.path);
        dataSourceLike = createUnconnectedInstance(
          createRequire(entry.path)("typeorm") as Record<string, unknown>,
          legacyOptions,
        );
      } else if (TS_ENTRY_PATTERN.test(entry.path)) {
        tscBuild = runTargetTsc(entry.path);
        dataSourceLike = await loadDataSourceInstance(
          mapToCompiledPath(entry.path, tscBuild),
        );
      } else {
        dataSourceLike = await loadDataSourceInstance(entry.path);
      }

      const rawEntities = dataSourceLike.options.entities ?? [];
      // `entities` can mix classes (already resolved via the import above)
      // with glob-path strings TypeORM resolves itself — those need the
      // same tsc-compiled mirror, built now if the entry-file branch above
      // didn't already need one (e.g. a legacy ormconfig.json, or a plain
      // .js entry that still points at .ts entity globs).
      const needsGlobBuild =
        !tscBuild && rawEntities.some((e) => typeof e === "string");
      if (needsGlobBuild) {
        tscBuild = runTargetTsc(entry.path);
      }
      const entitiesInput = tscBuild
        ? rewriteEntityGlobs(rawEntities, tscBuild)
        : rawEntities;

      const ConnectionMetadataBuilder = loadConnectionMetadataBuilderClass(
        entry.path,
      );
      const builder = new ConnectionMetadataBuilder(dataSourceLike);
      allEntityMetadatas = await builder.buildEntityMetadatas(entitiesInput);
    } finally {
      if (tscBuild) rmSync(tscBuild.outDir, { recursive: true, force: true });
    }

    // "junction"/"closure"/"closure-junction" tables are synthesized by
    // TypeORM itself (e.g. an implicit @ManyToMany join table) rather than
    // user-declared — the Relation built from the owning side already
    // implies them, so surfacing them as their own Entity would be
    // redundant. "entity-child" (single-table-inheritance subclasses) stays,
    // since each one is still a real @ChildEntity the user wrote.
    const entityMetadatas = allEntityMetadatas.filter(
      (m) =>
        m.tableType !== "junction" &&
        m.tableType !== "closure" &&
        m.tableType !== "closure-junction",
    );

    if (entityMetadatas.length === 0) {
      throw new Error(`No entities were found via "${entry.path}".`);
    }

    const entities = entityMetadatas.map(buildEntity);
    const relations = entityMetadatas
      .flatMap((entityMetadata) =>
        entityMetadata.relations.map((relation) =>
          buildRelation(entityMetadata, relation),
        ),
      )
      .filter((relation): relation is Relation => relation !== undefined);

    return { entities, relations };
  },
};
