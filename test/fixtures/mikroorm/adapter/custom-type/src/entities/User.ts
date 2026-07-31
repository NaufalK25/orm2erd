import { Type } from "@mikro-orm/core";
import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

// A Type subclass whose column type has no corresponding entry in the
// adapter's canonical-type lookup tables, forcing the runtimeType fallback.
class WeirdType extends Type<string> {
  getColumnType() {
    return "weird_custom_sql_type";
  }
}

@Entity()
export class User {
  @PrimaryKey({ type: "integer" })
  id!: number;

  @Property({ type: WeirdType })
  weird!: string;
}
