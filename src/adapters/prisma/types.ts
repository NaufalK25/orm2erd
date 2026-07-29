export interface RelationSide {
  modelName: string;
  fieldName: string;
  relatedModel: string;
  isList: boolean;
  hasFK: boolean;
  fkColumn?: string;
  refColumn?: string;
  // Whether this side's own relation field is required (`User` vs `User?`)
  // — mirrors the scalar FK field's nullability when this side `hasFK`.
  isRequired: boolean;
  // Raw Prisma referential-action strings (e.g. "Cascade"), only set on the
  // side that actually declares `@relation(onDelete: ..., onUpdate: ...)`.
  onDelete?: string;
  onUpdate?: string;
}
