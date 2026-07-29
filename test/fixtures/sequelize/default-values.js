function dataType(name) {
  return { constructor: { name } };
}

// Named function default (e.g. `defaultValue: generateUsername`).
function generateUsername() {
  return "user";
}

export const sequelize = {
  models: {
    User: {
      name: "User",
      rawAttributes: {
        id: { type: dataType("INTEGER"), primaryKey: true },
        // A plain function reference — resolveDefaultValue reads its name.
        username: { type: dataType("STRING"), defaultValue: generateUsername },
        // A genuinely anonymous function (JS's name-inference for a direct
        // property-value function expression would otherwise give it the
        // property's own name, so pull it from an array to sidestep that).
        referralCode: {
          type: dataType("STRING"),
          defaultValue: [() => "code"][0],
        },
        // Neither a Literal nor an empty-keys sentinel class, and not an
        // array — a plain object default falls through to JSON.stringify.
        settings: {
          type: dataType("JSON"),
          defaultValue: { theme: "dark" },
        },
        // Arrays are `typeof "object"` too, but must skip the
        // Literal/sentinel checks (which explicitly exclude arrays) and
        // still fall through to the same JSON.stringify path.
        roles: { type: dataType("JSON"), defaultValue: ["member"] },
      },
      associations: {},
    },
  },
  define: () => {},
};
