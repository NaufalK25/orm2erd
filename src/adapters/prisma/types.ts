export interface RelationSide {
  modelName: string;
  fieldName: string;
  relatedModel: string;
  isList: boolean;
  hasFK: boolean;
  fkColumn?: string;
  refColumn?: string;
  // Raw Prisma referential-action strings (e.g. "Cascade"), only set on the
  // side that actually declares `@relation(onDelete: ..., onUpdate: ...)`.
  onDelete?: string;
  onUpdate?: string;
}
