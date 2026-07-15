// Mirrors Sequelize v7's ".models" shape: an iterable Set instead of a
// plain object, which should make extract() fail loudly via the guard
// rather than silently produce an empty ERD.
export const sequelize = {
  models: new Set(["User"]),
  define: () => {},
};
