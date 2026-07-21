class DataSource {
  constructor(opts) {
    this.opts = opts;
  }
}

module.exports = { pool: new DataSource({ type: "custom" }) };
