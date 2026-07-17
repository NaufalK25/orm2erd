export interface RelationSide {
  modelName: string;
  fieldName: string;
  relatedModel: string;
  isList: boolean;
  hasFK: boolean;
  fkColumn?: string;
  refColumn?: string;
}
