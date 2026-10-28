const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env if present.
// We always fall back to safe, documented defaults so the app runs out of the box.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

function resolveFromBackend(relativeOrAbsolutePath) {
  if (!relativeOrAbsolutePath) return '';
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(BACKEND_ROOT, relativeOrAbsolutePath);
}

const config = {
  appName: 'Dunda na Fes',
  // Non-negotiable rule: always bind to localhost (127.0.0.1), never 0.0.0.0
  host: '127.0.0.1',
  port: Number(process.env.PORT) || 3001,

  paths: {
    repoRoot: REPO_ROOT,
    storageRoot: resolveFromBackend(process.env.STORAGE_ROOT || '../storage'),
    stagingDir: resolveFromBackend(process.env.STAGING_DIR || '../storage/staging'),
    libraryDir: resolveFromBackend(process.env.LIBRARY_DIR || '../storage/library'),
    tempDir: resolveFromBackend(process.env.TEMP_DIR || '../storage/temp'),
    modelsDir: resolveFromBackend(process.env.MODELS_DIR || '../storage/models'),
    dbPath: resolveFromBackend(process.env.DB_PATH || '../storage/db/dunda.sqlite'),
    pythonExecutable: resolveFromBackend(
      process.env.PYTHON_EXECUTABLE || '../separator/.venv/Scripts/python.exe'
    ),
    separatorScript: resolveFromBackend(
      process.env.SEPARATOR_SCRIPT || '../separator/separate.py'
    ),
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  },

  upload: {
    maxFileSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB) || 100,
    allowedExtensions: ['.mp3', '.wav', '.flac', '.m4a', '.ogg'],
  },

  models: {
    defaultModel: process.env.DEFAULT_MODEL || 'UVR-MDX-NET-Inst_HQ_3.onnx',
    fallbackModel: process.env.FALLBACK_MODEL || 'Kim_Vocal_2.onnx',
  },
};

module.exports = config;
