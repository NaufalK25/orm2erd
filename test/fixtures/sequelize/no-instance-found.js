// No Sequelize instance anywhere in this export tree — findSequelizeInstance
// must give up (rather than loop forever) once MAX_SEQUELIZE_SEARCH_DEPTH is
// hit, and loadSequelizeInstance must surface a clear error instead of
// crashing on `undefined`.
export const config = {
  database: { host: "localhost", port: 5432 },
};
export const helpers = { formatDate: (d) => d };
