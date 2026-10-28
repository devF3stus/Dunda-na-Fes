const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const { runMigrations } = require('./migrations');

let dbInstance = null;

/**
 * Initialize (or return the active) SQLite database connection, enable WAL and
 * foreign keys, and run any pending schema migrations.
 *
 * Accepts an optional `customDbPath` (e.g. `:memory:` or a temp file for tests).
 */
function initDatabase(customDbPath = null) {
  const targetPath = customDbPath || config.paths.dbPath;

  if (dbInstance && !customDbPath) {
    return dbInstance;
  }

  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  runMigrations(db);

  if (!customDbPath) {
    dbInstance = db;
  }

  return db;
}

function getDb() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

function setDbForTests(testDb) {
  dbInstance = testDb;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Startup recovery: mark any jobs that were left in 'queued' or 'running'
 * state when the server last stopped as 'failed', and clean up leftover
 * job-* folders inside `storage/temp/`.
 */
function recoverInterruptedJobsAndCleanupTemp(
  db = getDb(),
  tempDir = config.paths.tempDir
) {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE jobs
    SET status = 'failed',
        stage = 'failed',
        error_code = 'INTERRUPTED_BY_RESTART',
        error_message = 'Job was interrupted because the server was restarted before processing finished.',
        completed_at = ?
    WHERE status IN ('queued', 'running')
  `);
  const result = stmt.run(now);

  // Clean up any leftover `job-*` directories inside storage/temp/
  let cleanedDirs = 0;
  if (fs.existsSync(tempDir)) {
    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('job-')) {
        fs.rmSync(path.join(tempDir, entry.name), {
          recursive: true,
          force: true,
        });
        cleanedDirs += 1;
      }
    }
  }

  return {
    interruptedJobsMarkedFailed: Number(result.changes || 0),
    tempJobDirsRemoved: cleanedDirs,
  };
}

module.exports = {
  initDatabase,
  getDb,
  setDbForTests,
  closeDb,
  recoverInterruptedJobsAndCleanupTemp,
};
