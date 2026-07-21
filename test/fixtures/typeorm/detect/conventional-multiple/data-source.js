const { DataSource } = require("typeorm");

module.exports = new DataSource({ type: "postgres" });
