import { describe, it, expect } from "vitest";
import { dbmlEmitter } from "../../src/emitters/dbml";
import type { ERDModel } from "../../src/core/model";

describe("dbmlEmitter", () => {
  it("renders entities with field types, constraints, and defaults", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "id",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "email",
              type: "string",
              nativeType: "STRING",
              isUnique: true,
            },
            {
              name: "isActive",
              type: "boolean",
              nativeType: "BOOLEAN",
              defaultValue: "true",
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("Table User {");
    expect(output).toContain("id int [pk, not null]");
    expect(output).toContain("email string [unique, not null]");
    expect(output).toContain('isActive boolean [not null, default: "true"]');
  });

  it("escapes embedded double quotes in a default value instead of breaking the quoted attribute", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Config",
          fields: [
            {
              name: "monthlyOverride",
              type: "json",
              nativeType: "JSONB",
              defaultValue: '{"january":"","february":""}',
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(`default: "{'january':'','february':''}"`);
  });

  it("always uses the native type for enum fields, even in canonical mode", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Post",
          fields: [
            {
              name: "status",
              type: "enum",
              nativeType: "enum_Post_status",
              enumValues: ["draft", "published"],
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("status enum_Post_status");
    expect(output).toContain("Enum enum_Post_status {");
    expect(output).toContain('  "draft"');
    expect(output).toContain('  "published"');
  });

  it("dedupes an enum shared by multiple fields into a single Enum block", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "role",
              type: "enum",
              nativeType: "Role",
              enumValues: ["ADMIN", "USER"],
            },
          ],
        },
        {
          name: "Admin",
          fields: [
            {
              name: "role",
              type: "enum",
              nativeType: "Role",
              enumValues: ["ADMIN", "USER"],
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output.match(/Enum Role \{/g)).toHaveLength(1);
  });

  it("marks list fields with a [] suffix", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Profile",
          fields: [
            {
              name: "avatarFallback",
              type: "string",
              nativeType: "STRING",
              isList: true,
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("avatarFallback string[] [not null]");
  });

  it("renders each relation type with the correct DBML notation and its columns", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        {
          from: "Profile",
          to: "User",
          type: "1-1",
          fromColumn: "userId",
          toColumn: "id",
        },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
        },
      ],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("Ref: Profile.userId - User.id");
    expect(output).toContain("Ref: User.id > Post.authorId");
  });

  it("renders composite PK and multi-column unique in an indexes block", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Membership",
          primaryKey: ["userId", "orgId"],
          uniques: [["orgId", "role"]],
          fields: [
            { name: "userId", type: "int", nativeType: "INTEGER" },
            { name: "orgId", type: "int", nativeType: "INTEGER" },
            { name: "role", type: "string", nativeType: "STRING" },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("indexes {");
    expect(output).toContain("(userId, orgId) [pk]");
    expect(output).toContain("(orgId, role) [unique]");
  });

  it("declares a composite PK only in the indexes block, not per-field (no double pk)", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "Membership",
          primaryKey: ["userId", "orgId"],
          fields: [
            // Members carry isPrimaryKey from the adapter, but DBML must not
            // also tag them [pk] or dbdiagram double-defines the primary key.
            {
              name: "userId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "orgId",
              type: "int",
              nativeType: "INTEGER",
              isPrimaryKey: true,
              isNullable: false,
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain("userId int [not null]");
    expect(output).not.toContain("userId int [pk");
    expect(output).toContain("(userId, orgId) [pk]");
  });

  it("omits the indexes block when there are no composite keys", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "int", nativeType: "INTEGER" }],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).not.toContain("indexes {");
  });

  it("renders field and entity descriptions as DBML notes", () => {
    const model: ERDModel = {
      entities: [
        {
          name: "User",
          description: "Registered application users.",
          fields: [
            {
              name: "name",
              type: "string",
              nativeType: "STRING",
              description: "The user's display name.",
            },
          ],
        },
      ],
      relations: [],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).toContain(`note: 'The user"s display name.'`);
    expect(output).toContain(`Note: 'Registered application users.'`);
  });

  it("skips a relation missing a column on either side instead of emitting a bare table-to-table Ref", () => {
    const model: ERDModel = {
      entities: [],
      relations: [
        { from: "Post", to: "Tag", type: "n-n" },
        {
          from: "User",
          to: "Post",
          type: "1-n",
          fromColumn: "id",
          toColumn: "authorId",
        },
      ],
    };

    const output = dbmlEmitter.emit(model, { typeMode: "canonical" });

    expect(output).not.toContain("Post <> Tag");
    expect(output).not.toContain("Ref: Post ");
    expect(output).toContain("Ref: User.id > Post.authorId");
  });
});
