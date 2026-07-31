import { EntitySchema } from "@mikro-orm/core";

export const User = new EntitySchema({
  name: "User",
  properties: {
    id: { type: "integer", primary: true },
    name: { type: "string" },
  },
});
