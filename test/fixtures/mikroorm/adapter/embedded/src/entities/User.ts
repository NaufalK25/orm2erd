import {
  Embeddable,
  Embedded,
  Entity,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/legacy";

@Embeddable()
export class Address {
  @Property({ type: "string" })
  street!: string;

  @Property({ type: "string" })
  city!: string;
}

@Entity()
export class User {
  @PrimaryKey({ type: "integer" })
  id!: number;

  // Inline (default) mode: flattened into its own prefixed columns
  // (homeAddress_street, homeAddress_city) — no column of its own.
  @Embedded(() => Address)
  homeAddress!: Address;

  // `{ object: true }`: stored as a single JSON column instead.
  @Embedded(() => Address, { object: true })
  workAddress!: Address;
}
