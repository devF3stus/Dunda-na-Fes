const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const {
  initDatabase,
  recoverInterruptedJobsAndCleanupTemp,
} = require('./db');
const healthRoutes = require('./routes/healthRoutes');
const libraryRoutes = require('./routes/libraryRoutes');
const stagingRoutes = require('./routes/stagingRoutes');
const jobRoutes = require('./routes/jobRoutes');
const discoverRoutes = require('./routes/discoverRoutes');
const errorHandler = require('./middleware/errorHandler');

// Ensure all runtime storage directories exist on startup
function ensureStorageDirectories() {
  const dirs = [
    config.paths.storageRoot,
    config.paths.stagingDir,
    config.paths.libraryDir,
    config.paths.tempDir,
    config.paths.modelsDir,
    path.dirname(config.paths.dbPath),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Clean up any leftover `upload-*.tmp` or `discover-*` files in `storage/temp/` on startup.
 */
function cleanupStaleTempUploadFiles(tempDir = config.paths.tempDir) {
  if (!fs.existsSync(tempDir)) return;
  try {
    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isFile() &&
        ((entry.name.startsWith('upload-') && entry.name.endsWith('.tmp')) ||
          entry.name.startsWith('discover-'))
      ) {
        fs.rmSync(path.join(tempDir, entry.name), { force: true });
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

function createApp({ skipDbInit = false } = {}) {
  ensureStorageDirectories();
  cleanupStaleTempUploadFiles();

  if (!skipDbInit) {
    const db = initDatabase();
    recoverInterruptedJobsAndCleanupTemp(db);
  }

  const app = express();
  app.use(express.json());

  // Routes
  app.use('/api/health', healthRoutes);
  app.use('/api/library', libraryRoutes);
  app.use('/api/staging', stagingRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/discover', discoverRoutes);

  // 404 handler for unknown API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  // Central human-readable error handler
  app.use(errorHandler);

  return app;
}

if (require.main === module) {
  const app = createApp();
  // Non-negotiable rule: bind strictly to 127.0.0.1 (localhost), never 0.0.0.0
  app.listen(config.port, config.host, () => {
    console.log(
      `[${config.appName}] Backend listening strictly on http://${config.host}:${config.port}`
    );
  });
}

module.exports = { createApp };
