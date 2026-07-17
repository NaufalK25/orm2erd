import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import type { ORMAdapter, ResolvedEntry } from "../types";
import { looksLikeMongooseSchemaSource } from "./schema-source";
import type {
  MongooseModel,
  MongooseModule,
  MongooseSchemaType,
  MongooseSchemaTypeOptions,
  RefSide,
} from "./types";
import type {
  CanonicalType,
  Entity,
  ERDModel,
  Field,
  Relation,
} from "../../core/model";

const MONGOOSE_TYPE_TO_CANONICAL: Record<string, CanonicalType> = {
  String: "string",
  Number: "float",
  Double: "float",
  Int32: "int",
  Boolean: "boolean",
  Date: "datetime",
  // Casing changed between majors: "ObjectID" through mongoose 6.x,
  // "ObjectId" from 7.x on — support both rather than pinning to one.
  ObjectID: "string",
  ObjectId: "string",
  Decimal128: "decimal",
  Buffer: "bytes",
  Map: "json",
  UUID: "string",
  BigInt: "bigint",
  Embedded: "json",
  DocumentArrayElement: "json",
  Mixed: "unknown",
  Union: "unknown",
};

function toCanonicalType(instance: string): CanonicalType {
  return MONGOOSE_TYPE_TO_CANONICAL[instance] ?? "unknown";
}

function elementType(path: MongooseSchemaType): MongooseSchemaType {
  return path.instance === "Array"
    ? (path.caster ?? path.embeddedSchemaType ?? path)
    : path;
}

// Map's value-type placeholder ("someMap.$*") isn't a real document field —
// it describes what's stored inside the Map, not a path of its own.
function isSyntheticPath(fieldName: string): boolean {
  return fieldName.endsWith(".$*");
}

function resolveEnumValues(
  rawEnum: MongooseSchemaTypeOptions["enum"],
): string[] | undefined {
  const values = Array.isArray(rawEnum) ? rawEnum : rawEnum?.values;
  return values && values.length > 0 ? values : undefined;
}

function resolveDefaultValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // "()" signals a computed default (e.g. Date.now) rather than a literal
  // value — same convention as the Sequelize adapter's sentinel DataTypes.
  if (typeof value === "function") return `${value.name || "(function)"}()`;
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function looksLikeMongooseModule(value: unknown): value is MongooseModule {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MongooseModule).models === "object" &&
    typeof (value as MongooseModule).set === "function"
  );
}

async function loadTargetMongoose(fromPath: string): Promise<MongooseModule> {
  const targetRequire = createRequire(fromPath);
  let resolvedPath: string;
  try {
    resolvedPath = targetRequire.resolve("mongoose");
  } catch (err) {
    throw new Error(
      `Could not resolve "mongoose" from "${fromPath}" — is it installed in the target project?`,
      { cause: err },
    );
  }

  // Importing this exact resolved path (rather than a bare "mongoose"
  // specifier from orm2erd's own resolution context) is what makes this the
  // same module instance the target's schema files import — so its global
  // `.models` registry reflects their side effects once we import those too.
  const mod = await tsImport(pathToFileURL(resolvedPath).href, import.meta.url);
  const candidate = (mod as { default?: unknown }).default ?? mod;
  if (!looksLikeMongooseModule(candidate)) {
    throw new Error(`"${resolvedPath}" doesn't look like the mongoose module.`);
  }
  return candidate;
}

const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".turbo",
]);
const SOURCE_FILE_PATTERN = /\.(m|c)?[jt]s$/;
const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]s$/;
// Safety valve for pathological directories.
const MAX_FILES_TO_IMPORT = 2000;
// Mirrors the detector's own guard — a directory entry can be much broader
// than "just models" (e.g. a whole src/), so files get content-checked
// before reading, same reasoning as findMongooseSchemaDirs.
const MAX_FILE_SIZE_BYTES = 1_000_000;

// A directory entry can contain arbitrary application code, not just
// schema files (e.g. an entry point that calls app.listen()) — importing
// one of those for its side effects would actually start a server/open a
// port, not just read metadata. Content-checking every candidate first,
// the same signature the detector uses to find this directory in the first
// place, is what keeps "import everything in this directory" safe.
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const stack: string[] = [dir];

  while (stack.length > 0 && files.length < MAX_FILES_TO_IMPORT) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (
          !EXCLUDED_DIR_NAMES.has(entry.name) &&
          !entry.name.startsWith(".")
        ) {
          stack.push(join(current, entry.name));
        }
        continue;
      }
      if (!entry.isFile() || !SOURCE_FILE_PATTERN.test(entry.name)) continue;
      if (entry.name.endsWith(".d.ts") || TEST_FILE_PATTERN.test(entry.name))
        continue;

      const filePath = join(current, entry.name);
      try {
        if (statSync(filePath).size > MAX_FILE_SIZE_BYTES) continue;
        if (!looksLikeMongooseSchemaSource(readFileSync(filePath, "utf-8")))
          continue;
      } catch {
        continue;
      }

      files.push(filePath);
    }
  }

  return files;
}

async function importForSideEffects(filePath: string): Promise<void> {
  // Polyfill CJS globals since tsImport loads files as ESM, where none of
  // these exist — mirrors the Sequelize adapter's loadSequelizeInstance.
  globalThis.require = createRequire(filePath);
  globalThis.__filename = filePath;
  globalThis.__dirname = dirname(filePath);
  await tsImport(pathToFileURL(filePath).href, import.meta.url);
}

function buildField(
  modelName: string,
  fieldName: string,
  path: MongooseSchemaType,
): Field {
  const isList = path.instance === "Array";
  const effective = elementType(path);
  const enumValues = resolveEnumValues(effective.options?.enum);

  return {
    name: fieldName,
    type: enumValues ? "enum" : toCanonicalType(effective.instance),
    nativeType: enumValues
      ? `enum_${modelName}_${fieldName}`
      : effective.instance,
    isList,
    isPrimaryKey: fieldName === "_id",
    isForeignKey: Boolean(effective.options?.ref),
    // Mongoose always requires _id unless a schema opts out with `_id: false`
    // — that opt-out is rare enough to skip supporting for now.
    isNullable: fieldName === "_id" ? false : !path.isRequired,
    isUnique: Boolean(path.options?.unique),
    defaultValue: resolveDefaultValue(path.options?.default),
    enumValues,
  };
}

function buildEntity(name: string, model: MongooseModel): Entity {
  return {
    name,
    fields: Object.entries(model.schema.paths)
      // __v is Mongoose's own bookkeeping column, not modeled data — every
      // document gets one, so surfacing it would just add noise to every entity.
      .filter(
        ([fieldName]) => fieldName !== "__v" && !isSyntheticPath(fieldName),
      )
      .map(([fieldName, path]) => buildField(name, fieldName, path)),
  };
}

function collectRefSides(models: Record<string, MongooseModel>): RefSide[] {
  const sides: RefSide[] = [];
  for (const [modelName, model] of Object.entries(models)) {
    for (const [fieldName, path] of Object.entries(model.schema.paths)) {
      if (isSyntheticPath(fieldName)) continue;
      const isList = path.instance === "Array";
      const effective = elementType(path);
      const ref = effective.options?.ref;
      if (!ref) continue;
      sides.push({
        modelName,
        relatedModel: ref,
        fieldName,
        isList,
        isUnique: Boolean(path.options?.unique),
      });
    }
  }
  return sides;
}

// A reciprocal pair (e.g. Author.posts: [ref Post] + Post.author: ref
// Author) collapses into one Relation. Mongoose has no shared key linking
// the two sides the way Prisma's relationName or Sequelize's foreignKey
// does, so "exactly one side declared on each of the two models, each
// pointing back at the other" is the only safe signal to merge on.
function buildPairedRelation(a: RefSide, b: RefSide): Relation {
  if (a.isList !== b.isList) {
    const listSide = a.isList ? a : b;
    const singularSide = a.isList ? b : a;
    // The physical FK column is the singular side's own field — the array
    // is a denormalized convenience, not a real join column.
    return {
      from: listSide.modelName,
      to: singularSide.modelName,
      type: "1-n",
      fieldName: listSide.fieldName,
      fromColumn: "_id",
      toColumn: singularSide.fieldName,
    };
  }

  // Deterministic, arbitrary tie-break for which side is "from" — both
  // physically store a pointer, so there's no inherent owner to prefer.
  const [from, to] = a.modelName < b.modelName ? [a, b] : [b, a];

  if (a.isList && b.isList) {
    // Denormalized many-to-many via ref arrays on both sides — no single
    // join column to point at, same as an implicit relational join table.
    return {
      from: from.modelName,
      to: to.modelName,
      type: "n-n",
      fieldName: from.fieldName,
    };
  }

  return {
    from: from.modelName,
    to: to.modelName,
    type: "1-1",
    fieldName: from.fieldName,
    fromColumn: from.fieldName,
    toColumn: "_id",
  };
}

function buildStandaloneRelation(side: RefSide): Relation {
  if (side.isList) {
    // "Has many" via an array of refs, no reciprocal field on the other
    // model — nothing to point dbml's Ref at, same as an implicit m2m.
    return {
      from: side.modelName,
      to: side.relatedModel,
      type: "1-n",
      fieldName: side.fieldName,
    };
  }

  if (side.isUnique) {
    return {
      from: side.modelName,
      to: side.relatedModel,
      type: "1-1",
      fieldName: side.fieldName,
      fromColumn: side.fieldName,
      toColumn: "_id",
    };
  }

  // A non-unique singular ref means many documents can point at the same
  // target, so the target is the "one" side even though it declares no
  // field of its own for this relation.
  return {
    from: side.relatedModel,
    to: side.modelName,
    type: "1-n",
    fieldName: side.fieldName,
    fromColumn: "_id",
    toColumn: side.fieldName,
  };
}

function buildRelations(models: Record<string, MongooseModel>): Relation[] {
  const sidesByPairKey = new Map<string, RefSide[]>();
  for (const side of collectRefSides(models)) {
    const key = [side.modelName, side.relatedModel].toSorted().join("::");
    const group = sidesByPairKey.get(key) ?? [];
    group.push(side);
    sidesByPairKey.set(key, group);
  }

  const relations: Relation[] = [];
  for (const group of sidesByPairKey.values()) {
    const [a, b] = group;
    const isReciprocalPair =
      group.length === 2 &&
      a.modelName !== b.modelName &&
      a.relatedModel === b.modelName &&
      b.relatedModel === a.modelName;

    if (isReciprocalPair) {
      relations.push(buildPairedRelation(a, b));
      continue;
    }

    // Anything else (a lone side, a self-reference, or multiple distinct
    // refs between the same two models) is ambiguous to pair — emit each
    // side standalone rather than guess wrong.
    for (const side of group) {
      relations.push(buildStandaloneRelation(side));
    }
  }
  return relations;
}

export const mongooseAdapter: ORMAdapter = {
  name: "mongoose",

  async resolveEntry(input, cwd) {
    const absoluteInput = resolve(cwd, input);
    try {
      const stat = statSync(absoluteInput);
      if (!stat.isFile() && !stat.isDirectory()) {
        throw new Error(
          `"${absoluteInput}" is neither a file nor a directory.`,
        );
      }
      return { path: absoluteInput };
    } catch (err) {
      throw new Error(
        `Failed to load Mongoose entry from "${input}": ${(err as Error).message}. Check the --entry path or run without --entry to pick interactively.`,
        { cause: err },
      );
    }
  },

  async extract(entry: ResolvedEntry): Promise<ERDModel> {
    for (const file of [".env.local", ".env"]) {
      try {
        process.loadEnvFile(file);
      } catch {}
    }

    const stat = statSync(entry.path);
    const filesToImport = stat.isDirectory()
      ? collectSourceFiles(entry.path)
      : [entry.path];

    if (filesToImport.length === 0) {
      throw new Error(`No .ts/.js files found under "${entry.path}".`);
    }

    const mongoose = await loadTargetMongoose(filesToImport[0]);
    // Directory-wide import is best-effort — a colliding model name (e.g.
    // from a test fixture that slipped past collectSourceFiles) shouldn't
    // abort the whole extraction.
    mongoose.set("overwriteModels", true);

    for (const file of filesToImport) {
      try {
        await importForSideEffects(file);
      } catch {
        // Best-effort: a file that isn't actually a model, or throws for an
        // unrelated reason, shouldn't abort the rest of the directory scan.
      }
    }

    const modelNames = Object.keys(mongoose.models);
    if (modelNames.length === 0) {
      throw new Error(
        `No mongoose models were registered after importing "${entry.path}".`,
      );
    }

    const entities = modelNames.map((name) =>
      buildEntity(name, mongoose.models[name]),
    );
    const relations = buildRelations(mongoose.models);

    return { entities, relations };
  },
};
