import { existsSync } from "node:fs";
import { resolve } from "node:path";
import prismaInternals from "@prisma/internals";
import type { Field } from "@prisma/dmmf";
import type { ORMAdapter, ResolvedEntry } from "../types";
import type { CanonicalType, ERDModel } from "../../core/model";
import { resolvePrismaConfigSchema } from "./config";
import type { RelationSide } from "./types";

const PRISMA_SCALAR_TO_CANONICAL: Record<string, CanonicalType> = {
  String: "string",
  Int: "int",
  Float: "float",
  Decimal: "decimal",
  Boolean: "boolean",
  DateTime: "datetime",
  Json: "json",
  Bytes: "bytes",
  BigInt: "bigint",
};

function toCanonicalType(kind: Field["kind"], type: string): CanonicalType {
  if (kind === "enum") return "enum";
  return PRISMA_SCALAR_TO_CANONICAL[type] ?? "unknown";
}

// getDMMF() only needs schema shape, not a real connection, but Prisma
// errors on missing datasource env vars unless these fields are stripped.
function stripDatasourceUrls(content: string): string {
  return content.replace(/^\s*(url|directUrl|shadowDatabaseUrl)\s*=.*$/gm, "");
}

function resolveDefaultValue(defaultValue?: Field["default"]) {
  if (defaultValue === undefined) {
    return undefined;
  }

  if (Array.isArray(defaultValue)) {
    return defaultValue.join(", ");
  }

  // Function-call defaults like @default(now()) come through DMMF as
  // { name: "now", args: [] } instead of a literal value.
  if (typeof defaultValue === "object" && "name" in defaultValue) {
    return `${defaultValue.name}(${defaultValue.args.join(", ")})`;
  }

  return defaultValue.toString();
}

export const prismaAdapter: ORMAdapter = {
  name: "prisma",

  async resolveEntry(input, cwd) {
    const resolvedInput = resolve(cwd, input);
    if (existsSync(resolvedInput)) {
      return { path: resolvedInput };
    }

    const configSchema = await resolvePrismaConfigSchema(cwd);
    return { path: configSchema ?? resolvedInput };
  },

  async extract(entry: ResolvedEntry): Promise<ERDModel> {
    let schemas: Awaited<
      ReturnType<typeof prismaInternals.getSchemaWithPath>
    >["schemas"];

    try {
      ({ schemas } = await prismaInternals.getSchemaWithPath({
        schemaPath: { cliProvidedPath: entry.path },
      }));
    } catch (err) {
      throw new Error(
        `Failed to load Prisma schema from "${entry.path}": ${(err as Error).message}. Check the --entry path or run without --entry to pick interactively.`,
        { cause: err },
      );
    }

    const sanitizedSchemas = schemas.map(
      ([path, content]) =>
        [path, stripDatasourceUrls(content)] as [string, string],
    );

    const dmmf = await prismaInternals.getDMMF({ datamodel: sanitizedSchemas });

    const enumValuesByName = new Map(
      dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]),
    );

    const entities = dmmf.datamodel.models.map((model) => {
      const foreignKeyFields = new Set(
        model.fields.flatMap((f) => f.relationFromFields ?? []),
      );
      const compositeKeyFields = new Set(model.primaryKey?.fields ?? []);

      // Composite PK / multi-column uniques the per-field booleans can't
      // express. Single-column ones (length 1) stay on isPrimaryKey/isUnique.
      const primaryKey =
        model.primaryKey && model.primaryKey.fields.length > 1
          ? [...model.primaryKey.fields]
          : undefined;
      const uniques = model.uniqueFields
        .filter((u) => u.length > 1)
        .map((u) => [...u]);

      return {
        name: model.name,
        primaryKey,
        uniques: uniques.length > 0 ? uniques : undefined,
        description: model.documentation,
        fields: model.fields
          .filter((f) => f.kind !== "object")
          .map((f) => ({
            name: f.name,
            type: toCanonicalType(f.kind, f.type),
            nativeType: f.nativeType?.[0] ?? f.type,
            isList: f.isList,
            isPrimaryKey: f.isId || compositeKeyFields.has(f.name),
            isForeignKey: foreignKeyFields.has(f.name),
            isNullable: !f.isRequired,
            isUnique: f.isUnique,
            defaultValue: f.hasDefaultValue
              ? resolveDefaultValue(f.default)
              : undefined,
            enumValues:
              f.kind === "enum" ? enumValuesByName.get(f.type) : undefined,
            description: f.documentation,
          })),
      };
    });

    // Prisma emits a relation field on both related models, so group by
    // relationName and collapse each pair into a single Relation below.
    const sidesByRelationName = new Map<string, RelationSide[]>();
    for (const model of dmmf.datamodel.models) {
      for (const f of model.fields) {
        if (f.kind !== "object" || !f.relationName) continue;
        const sides = sidesByRelationName.get(f.relationName) ?? [];
        sides.push({
          modelName: model.name,
          fieldName: f.name,
          relatedModel: f.type,
          isList: f.isList,
          hasFK: Boolean(f.relationFromFields?.length),
          fkColumn: f.relationFromFields?.[0],
          refColumn: f.relationToFields?.[0],
        });
        sidesByRelationName.set(f.relationName, sides);
      }
    }

    const relations = Array.from(sidesByRelationName.values()).map((sides) => {
      if (sides.length < 2) {
        const [only] = sides;
        return {
          from: only.modelName,
          to: only.relatedModel,
          type: (only.isList ? "1-n" : "1-1") as "1-1" | "1-n" | "n-n",
          fieldName: only.fieldName,
          fromColumn: only.hasFK ? only.fkColumn : undefined,
          toColumn: only.hasFK ? only.refColumn : undefined,
        };
      }

      const [a, b] = sides;
      if (a.isList && b.isList) {
        // Implicit m2m join table — Prisma doesn't expose its FK columns
        // as model fields, so there's no column to attach here.
        return {
          from: a.modelName,
          to: a.relatedModel,
          type: "n-n" as const,
          fieldName: a.fieldName,
        };
      }
      if (a.isList !== b.isList) {
        const oneSide = a.isList ? a : b;
        // The FK column lives on the non-list ("many") side, not `oneSide`.
        const manySide = a.isList ? b : a;
        return {
          from: oneSide.modelName,
          to: oneSide.relatedModel,
          type: "1-n" as const,
          fieldName: oneSide.fieldName,
          fromColumn: manySide.refColumn,
          toColumn: manySide.fkColumn,
        };
      }
      // 1-1: use the side that actually holds the FK column as "from".
      const owner = a.hasFK ? a : b;
      return {
        from: owner.modelName,
        to: owner.relatedModel,
        type: "1-1" as const,
        fieldName: owner.fieldName,
        fromColumn: owner.fkColumn,
        toColumn: owner.refColumn,
      };
    });

    return { entities, relations };
  },
};
