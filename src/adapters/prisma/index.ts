import prismaInternals from "@prisma/internals";
import type { Field } from "@prisma/dmmf";
import type { ORMAdapter, ResolvedEntry } from "../types";
import type { CanonicalType, ERDModel } from "../../core/model";

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

function resolveDefaultValue(defaultValue?: Field["default"]) {
  if (!defaultValue) {
    return undefined;
  }

  if (Array.isArray(defaultValue)) {
    return defaultValue.join(", ");
  }

  if (typeof defaultValue === "object" && "name" in defaultValue) {
    return `${defaultValue.name}(${defaultValue.args.join(", ")})`;
  }

  return defaultValue.toString();
}

export const prismaAdapter: ORMAdapter = {
  name: "prisma",

  async resolveEntry(input) {
    return { path: input };
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
      );
    }

    const dmmf = await prismaInternals.getDMMF({ datamodel: schemas });

    const enumValuesByName = new Map(
      dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]),
    );

    const entities = dmmf.datamodel.models.map((model) => {
      const foreignKeyFields = new Set(
        model.fields.flatMap((f) => f.relationFromFields ?? []),
      );

      return {
        name: model.name,
        fields: model.fields
          .filter((f) => f.kind !== "object")
          .map((f) => ({
            name: f.name,
            type: toCanonicalType(f.kind, f.type),
            nativeType: f.nativeType?.[0] ?? f.type,
            isList: f.isList,
            isPrimaryKey: f.isId,
            isForeignKey: foreignKeyFields.has(f.name),
            isNullable: !f.isRequired,
            isUnique: f.isUnique,
            defaultValue: f.hasDefaultValue
              ? resolveDefaultValue(f.default)
              : undefined,
            enumValues:
              f.kind === "enum" ? enumValuesByName.get(f.type) : undefined,
          })),
      };
    });

    const relations = dmmf.datamodel.models.flatMap((model) =>
      model.fields
        .filter((f) => f.kind === "object" && f.relationName)
        .map((f) => ({
          from: model.name,
          to: f.type,
          type: (f.isList ? "1-n" : "1-1") as "1-1" | "1-n",
          fieldName: f.name,
        })),
    );

    return { entities, relations };
  },
};
