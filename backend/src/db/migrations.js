/**
 * Numbered SQL migrations for Dunda na Fes.
 * Each migration runs inside a transaction once and is recorded in `schema_migrations`.
 */
const MIGRATIONS = [
  {
    version: 1,
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS staged_files (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        suggested_name TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('upload', 'discover')),
        license_info TEXT NOT NULL DEFAULT 'Personal Local File',
        size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
        duration_seconds REAL NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS library_entries (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('upload', 'discover')),
        license_info TEXT NOT NULL DEFAULT 'Personal Local File',
        duration_seconds REAL NULL,
        vocals_path TEXT NOT NULL,
        instrumental_path TEXT NOT NULL,
        model_used TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'error')),
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_library_created_at
        ON library_entries(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_library_display_name
        ON library_entries(display_name COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        staged_file_id TEXT NULL,
        custom_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
        stage TEXT NOT NULL DEFAULT 'queued',
        progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
        message TEXT NOT NULL DEFAULT '',
        error_code TEXT NULL,
        error_message TEXT NULL,
        library_entry_id TEXT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status
        ON jobs(status);
    `,
  },
];

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      insertMigration.run(
        migration.version,
        migration.name,
        new Date().toISOString()
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

module.exports = {
  MIGRATIONS,
  runMigrations,
};
