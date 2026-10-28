const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

function checkSqliteReadiness() {
  try {
    const db = new DatabaseSync(':memory:');
    const row = db.prepare('SELECT sqlite_version() AS version').get();
    db.close();
    return {
      ok: true,
      driver: 'node:sqlite',
      sqliteVersion: row.version,
    };
  } catch (err) {
    return {
      ok: false,
      driver: 'node:sqlite',
      error: 'Database engine failed to initialize.',
    };
  }
}

function getHealthReport(req, res) {
  const sqlite = checkSqliteReadiness();

  res.status(200).json({
    status: 'ok',
    message: 'backend OK',
    app: config.appName,
    host: config.host,
    port: config.port,
    nodeVersion: process.version,
    sqlite,
    models: {
      defaultModel: config.models.defaultModel,
      fallbackModel: config.models.fallbackModel,
    },
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealthReport,
};
