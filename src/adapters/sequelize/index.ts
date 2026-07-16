import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tsImport } from "tsx/esm/api";
import type { ORMAdapter, ResolvedEntry } from "../types";
import type { CanonicalType, ERDModel, Relation } from "../../core/model";

// Local shapes for the Sequelize runtime metadata we read. Not imported from
// `sequelize` itself, to avoid a dual-package hazard if the target project
// has its own separate install. See https://sequelize.org/api/v7/classes/_sequelize_core.index.model
// and .../index.association for the source of truth.
interface SequelizeDataType {
  constructor: { name: string };
  values?: string[]; // present on DataTypes.ENUM(...) instances
}

interface SequelizeAttribute {
  type: SequelizeDataType;
  primaryKey?: boolean;
  allowNull?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
}

interface SequelizeAssociation {
  associationType: "HasOne" | "BelongsTo" | "HasMany" | "BelongsToMany";
  foreignKey: string;
  otherKey?: string; // BelongsToMany only — the join column for the *other* model
  target: { name: string };
  as?: string;
}

interface SequelizeModel {
  name: string;
  rawAttributes: Record<string, SequelizeAttribute>;
  associations: Record<string, SequelizeAssociation>;
  associate?: (models: Record<string, SequelizeModel>) => void;
}

interface SequelizeInstance {
  models: Record<string, SequelizeModel>;
  define: (...args: unknown[]) => unknown;
}

const SEQUELIZE_TYPE_TO_CANONICAL: Record<string, CanonicalType> = {
  STRING: "string",
  TEXT: "string",
  CHAR: "string",
  CITEXT: "string",
  INTEGER: "int",
  SMALLINT: "int",
  TINYINT: "int",
  BIGINT: "bigint",
  FLOAT: "float",
  REAL: "float",
  DOUBLE: "float",
  DECIMAL: "decimal",
  BOOLEAN: "boolean",
  DATE: "datetime",
  DATEONLY: "datetime",
  JSON: "json",
  JSONB: "json",
  BLOB: "bytes",
  ENUM: "enum",
};

function toCanonicalType(nativeType: string): CanonicalType {
  return SEQUELIZE_TYPE_TO_CANONICAL[nativeType] ?? "unknown";
}

function resolveDefaultValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "function") return value.name || "(function)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function looksLikeSequelizeInstance(
  value: unknown,
): value is SequelizeInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SequelizeInstance).models === "object" &&
    typeof (value as SequelizeInstance).define === "function"
  );
}

// Export shapes vary a lot in the wild (named export, default export, CJS
// `db.sequelize`, double-wrapped CJS-in-ESM, a Model class's static
// `.sequelize`), so search a few levels deep instead of guessing paths.
const MAX_SEQUELIZE_SEARCH_DEPTH = 3;

function findSequelizeInstance(
  value: unknown,
  depth = 0,
): SequelizeInstance | undefined {
  if (looksLikeSequelizeInstance(value)) return value;
  if (depth >= MAX_SEQUELIZE_SEARCH_DEPTH) return undefined;
  // Model classes are functions but still carry a static `.sequelize`, so
  // don't skip them here.
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return undefined;
  }

  for (const nested of Object.values(value)) {
    const found = findSequelizeInstance(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function loadSequelizeInstance(path: string): Promise<SequelizeInstance> {
  // Some real-world files mix a raw `require()` into otherwise-real ESM
  // (often written for Bun, which allows this; Node's ESM does not). Polyfill
  // a global `require` bound to the target file so those calls still work,
  // resolving against the target project's own node_modules.
  globalThis.require = createRequire(path);

  const mod = await tsImport(path, import.meta.url);
  const candidate = findSequelizeInstance(mod);
  if (!candidate) {
    throw new Error(
      `Could not find a Sequelize instance exported from "${path}". Export it (e.g. "export const sequelize = new Sequelize(...)").`,
    );
  }
  return candidate;
}

async function loadSequelizeInstanceFromDirectory(
  path: string,
): Promise<SequelizeInstance> {
  throw new Error(
    `"${path}" is a model directory without a recognized index.js/.ts aggregator, which isn't supported yet. Point --entry at a single entry file that exports a configured Sequelize instance, or add an aggregator (see sequelize-cli's generated models/index.js).`,
  );
}

export const sequelizeAdapter: ORMAdapter = {
  name: "sequelize",

  async resolveEntry(input, cwd) {
    const absoluteInput = resolve(cwd, input);
    try {
      const stat = statSync(absoluteInput);

      if (stat.isFile()) {
        return { path: absoluteInput };
      }

      if (stat.isDirectory()) {
        const jsPath = join(absoluteInput, "index.js");
        const tsPath = join(absoluteInput, "index.ts");
        const indexPath = existsSync(tsPath)
          ? tsPath
          : existsSync(jsPath)
            ? jsPath
            : undefined;

        if (indexPath) {
          return { path: indexPath };
        }

        return { path: absoluteInput };
      }

      throw new Error(`"${absoluteInput}" is neither a file nor a directory.`);
    } catch (err) {
      throw new Error(
        `Failed to load Sequelize entry from "${input}": ${(err as Error).message}. Check the --entry path or run without --entry to pick interactively.`,
        { cause: err },
      );
    }
  },

  async extract(entry: ResolvedEntry): Promise<ERDModel> {
    try {
      process.loadEnvFile();
    } catch {}

    const stat = statSync(entry.path);
    const sequelize = stat.isFile()
      ? await loadSequelizeInstance(entry.path)
      : await loadSequelizeInstanceFromDirectory(entry.path);

    // Sequelize v7 stores `.models` as an iterable Set instead of a plain
    // object, silently yielding zero entities via Object.entries() below.
    // Fail loudly instead — only v6.x's plain-object shape is supported.
    if (
      typeof (
        sequelize.models as unknown as Record<typeof Symbol.iterator, unknown>
      )[Symbol.iterator] === "function"
    ) {
      throw new Error(
        'Unsupported Sequelize version: ".models" is not a plain object (looks like Sequelize v7+). Only Sequelize v6.x is currently supported.',
      );
    }

    const entities = Object.entries(sequelize.models).map(([name, model]) => {
      const foreignKeyFields = new Set(
        Object.values(model.associations).map((a) => a.foreignKey),
      );
      return {
        name,
        fields: Object.entries(model.rawAttributes).map(
          ([fieldName, attr]) => ({
            name: fieldName,
            type: toCanonicalType(attr.type.constructor.name),
            nativeType: attr.type.constructor.name,
            isPrimaryKey: !!attr.primaryKey,
            isForeignKey: foreignKeyFields.has(fieldName),
            // rawAttributes doesn't set allowNull on primary keys, even
            // though they're always NOT NULL.
            isNullable: attr.primaryKey ? false : attr.allowNull !== false,
            isUnique: !!attr.unique,
            defaultValue: resolveDefaultValue(attr.defaultValue),
            enumValues:
              attr.type.constructor.name === "ENUM"
                ? attr.type.values
                : undefined,
          }),
        ),
      };
    });

    interface RelationSide {
      modelName: string;
      relatedModel: string;
      fieldName?: string;
      associationType: SequelizeAssociation["associationType"];
    }

    const sidesByKey = new Map<string, RelationSide[]>();
    for (const model of Object.values(sequelize.models)) {
      for (const assoc of Object.values(model.associations)) {
        // BelongsToMany's foreignKey/otherKey swap between the two inverse
        // sides, so sort them into one consistent key. Other types already
        // share the same foreignKey on both sides.
        const fkKey =
          assoc.associationType === "BelongsToMany" && assoc.otherKey
            ? [assoc.foreignKey, assoc.otherKey].toSorted().join(",")
            : assoc.foreignKey;
        const key = `${[model.name, assoc.target.name].toSorted().join("::")}::${fkKey}`;
        const sides = sidesByKey.get(key) ?? [];
        sides.push({
          modelName: model.name,
          relatedModel: assoc.target.name,
          fieldName: assoc.as,
          associationType: assoc.associationType,
        });
        sidesByKey.set(key, sides);
      }
    }

    const relations: Relation[] = Array.from(sidesByKey.values()).map(
      (sides) => {
        const belongsToMany = sides.find(
          (s) => s.associationType === "BelongsToMany",
        );
        if (belongsToMany) {
          return {
            from: belongsToMany.modelName,
            to: belongsToMany.relatedModel,
            type: "n-n",
            fieldName: belongsToMany.fieldName,
          };
        }

        const hasMany = sides.find((s) => s.associationType === "HasMany");
        if (hasMany) {
          return {
            from: hasMany.modelName,
            to: hasMany.relatedModel,
            type: "1-n",
            fieldName: hasMany.fieldName,
          };
        }

        // 1-1: prefer the BelongsTo side, since it's the one carrying the
        // FK column — matches the Prisma adapter's "owner = side with FK".
        const belongsTo = sides.find((s) => s.associationType === "BelongsTo");
        const owner = belongsTo ?? sides[0];
        return {
          from: owner.modelName,
          to: owner.relatedModel,
          type: "1-1",
          fieldName: owner.fieldName,
        };
      },
    );

    return { entities, relations };
  },
};
