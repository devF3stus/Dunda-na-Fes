const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const config = require('../config');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { sanitizeDisplayName } = require('../utils/naming');
const {
  getStagedFileById,
  deleteStagedFile,
  resolveSafeStagingFilePath,
} = require('../services/stagingService');
const { createLibraryEntry } = require('../services/libraryService');

function formatJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    stagedFileId: row.staged_file_id,
    customName: row.custom_name,
    modelName: row.model_name,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    message: row.message,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    libraryEntryId: row.library_entry_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * Terminate a child process tree on Windows (`taskkill /PID <pid> /T /F`)
 * so cancelling a job immediately stops Python and any FFmpeg sub-processes.
 */
function killProcessTree(childProcess) {
  if (!childProcess || !childProcess.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(childProcess.pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 5000,
      });
    } else {
      childProcess.kill('SIGKILL');
    }
  } catch {
    try {
      childProcess.kill();
    } catch {
      // Ignore if already exited
    }
  }
}

class JobQueueManager {
  constructor() {
    this.activeJobId = null;
    this.activeChildProcess = null;
    this.cancelledJobIds = new Set();
    this.isProcessingLoopRunning = false;
  }

  /**
   * List all jobs (newest first).
   */
  listJobs(db = getDb()) {
    const rows = db
      .prepare('SELECT * FROM jobs ORDER BY created_at DESC')
      .all();
    return rows.map(formatJobRow);
  }

  /**
   * Get a single job by ID, or throw 404 AppError.
   */
  getJobById(id, db = getDb()) {
    const row = db
      .prepare('SELECT * FROM jobs WHERE id = ?')
      .get(String(id || ''));

    if (!row) {
      throw new AppError(
        'JOB_NOT_FOUND',
        'Could not find the requested processing job.',
        404
      );
    }
    return formatJobRow(row);
  }

  /**
   * Enqueue a new separation job for a staged file and trigger the queue worker.
   */
  enqueueJob(
    { stagedFileId, customName, modelName },
    db = getDb()
  ) {
    if (!stagedFileId || typeof stagedFileId !== 'string') {
      throw new AppError(
        'VALIDATION_ERROR',
        'stagedFileId is required to start separation.',
        400
      );
    }

    // Verify the staged file exists in DB and on disk
    const stagedFile = getStagedFileById(stagedFileId, db);
    const stagedInputPath = resolveSafeStagingFilePath(
      stagedFile.storedFilename
    );
    if (!fs.existsSync(stagedInputPath)) {
      throw new AppError(
        'STAGED_FILE_MISSING_ON_DISK',
        `The staged audio file for "${stagedFile.originalName}" is missing from disk. Please upload it again.`,
        404
      );
    }

    // Prevent queueing the exact same staged file twice simultaneously
    const existingActive = db
      .prepare(
        "SELECT id FROM jobs WHERE staged_file_id = ? AND status IN ('queued', 'running') LIMIT 1"
      )
      .get(stagedFile.id);

    if (existingActive) {
      throw new AppError(
        'JOB_ALREADY_ACTIVE',
        `"${stagedFile.originalName}" is already queued or being processed.`,
        409
      );
    }

    const desiredName =
      customName && String(customName).trim()
        ? sanitizeDisplayName(customName)
        : stagedFile.suggestedName;

    const chosenModel =
      modelName && String(modelName).trim()
        ? String(modelName).trim()
        : config.models.defaultModel;

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO jobs (
        id, staged_file_id, custom_name, model_name,
        status, stage, progress, message, created_at
      ) VALUES (?, ?, ?, ?, 'queued', 'queued', 0, 'Waiting in queue...', ?)
    `
    ).run(jobId, stagedFile.id, desiredName, chosenModel, now);

    // Kick off the background worker asynchronously
    setImmediate(() => {
      this.processNextInQueue().catch((err) => {
        console.error('[JobQueueManager] Queue loop error:', err);
      });
    });

    return this.getJobById(jobId, db);
  }

  /**
   * Cancel a queued or running job.
   * - If queued: immediately marks status = 'cancelled'.
   * - If running: kills the Python child process tree, deletes temp files, and marks 'cancelled'.
   */
  cancelJob(jobId, db = getDb()) {
    const job = this.getJobById(jobId, db);

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      throw new AppError(
        'JOB_NOT_CANCELLABLE',
        `Cannot cancel a job that is already ${job.status}.`,
        409
      );
    }

    const now = new Date().toISOString();
    this.cancelledJobIds.add(job.id);

    db.prepare(
      `
      UPDATE jobs
      SET status = 'cancelled',
          stage = 'cancelled',
          message = 'Job cancelled by user.',
          error_code = 'JOB_CANCELLED',
          error_message = 'Separation was cancelled by the user.',
          completed_at = ?
      WHERE id = ?
    `
    ).run(now, job.id);

    if (this.activeJobId === job.id && this.activeChildProcess) {
      killProcessTree(this.activeChildProcess);
    }

    // Clean up any temp directory for this job
    const jobTempDir = path.join(config.paths.tempDir, `job-${job.id}`);
    if (fs.existsSync(jobTempDir)) {
      try {
        fs.rmSync(jobTempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows brief file lock; will also be cleaned in finally block
      }
    }

    return this.getJobById(job.id, db);
  }

  /**
   * Process queued jobs strictly ONE AT A TIME in FIFO order (`created_at ASC`).
   */
  async processNextInQueue() {
    if (this.isProcessingLoopRunning) {
      return;
    }
    this.isProcessingLoopRunning = true;

    try {
      while (true) {
        const db = getDb();
        const nextRow = db
          .prepare(
            "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
          )
          .get();

        if (!nextRow) {
          break;
        }

        await this.runSingleJob(formatJobRow(nextRow));
      }
    } finally {
      this.isProcessingLoopRunning = false;
    }
  }

  async runSingleJob(job) {
    const db = getDb();
    this.activeJobId = job.id;
    const jobTempDir = path.join(config.paths.tempDir, `job-${job.id}`);

    try {
      // Check if cancelled before starting
      if (this.cancelledJobIds.has(job.id)) {
        return;
      }

      // Verify Python executable exists
      const pythonBin = config.paths.pythonExecutable;
      const scriptPath = config.paths.separatorScript;

      if (!fs.existsSync(pythonBin)) {
        this.markJobFailed(
          job.id,
          'PYTHON_MISSING',
          `Python virtual environment was not found at "${pythonBin}". Please check separator/.venv.`
        );
        return;
      }

      if (!fs.existsSync(scriptPath)) {
        this.markJobFailed(
          job.id,
          'SEPARATOR_SCRIPT_MISSING',
          `Separator script was not found at "${scriptPath}".`
        );
        return;
      }

      // Fetch the staged file record
      let stagedFile;
      try {
        stagedFile = getStagedFileById(job.stagedFileId, db);
      } catch {
        this.markJobFailed(
          job.id,
          'STAGED_FILE_NOT_FOUND',
          'The staged audio file for this job no longer exists.'
        );
        return;
      }

      const inputAudioPath = resolveSafeStagingFilePath(
        stagedFile.storedFilename
      );
      if (!fs.existsSync(inputAudioPath)) {
        this.markJobFailed(
          job.id,
          'STAGED_FILE_MISSING_ON_DISK',
          'The staged audio file could not be found on disk.'
        );
        return;
      }

      fs.mkdirSync(jobTempDir, { recursive: true });

      const startedAt = new Date().toISOString();
      db.prepare(
        `
        UPDATE jobs
        SET status = 'running',
            stage = 'starting',
            progress = 2,
            message = 'Starting Python audio separator...',
            started_at = ?
        WHERE id = ? AND status != 'cancelled'
      `
      ).run(startedAt, job.id);

      const args = [
        scriptPath,
        '--input',
        inputAudioPath,
        '--output-dir',
        jobTempDir,
        '--model-dir',
        config.paths.modelsDir,
        '--model',
        job.modelName,
        '--fallback-model',
        config.models.fallbackModel,
      ];

      if (config.paths.ffmpegPath && config.paths.ffmpegPath !== 'ffmpeg') {
        args.push('--ffmpeg-path', config.paths.ffmpegPath);
      }

      const separationResult = await this.spawnSeparatorProcess(job.id, pythonBin, args);

      // If cancelled while child was running, stop here
      if (this.cancelledJobIds.has(job.id)) {
        return;
      }

      if (!separationResult.ok) {
        this.markJobFailed(
          job.id,
          separationResult.errorCode || 'SEPARATION_FAILED',
          separationResult.errorMessage ||
            'Audio separation failed unexpectedly.'
        );
        return;
      }

      // Move finished vocals.wav and instrumental.wav into storage/library/<libraryId>/
      const libraryId = crypto.randomUUID();
      const entryDir = path.join(config.paths.libraryDir, libraryId);
      fs.mkdirSync(entryDir, { recursive: true });

      const ext = path.extname(separationResult.vocalsPath) || '.wav';
      const destVocalsAbs = path.join(entryDir, `vocals${ext}`);
      const destInstAbs = path.join(entryDir, `instrumental${ext}`);

      this.moveFileSafe(separationResult.vocalsPath, destVocalsAbs);
      this.moveFileSafe(separationResult.instrumentalPath, destInstAbs);

      const relVocals = `${libraryId}/vocals${ext}`;
      const relInst = `${libraryId}/instrumental${ext}`;

      const libraryEntry = createLibraryEntry(
        {
          id: libraryId,
          displayName: job.customName,
          originalName: stagedFile.originalName,
          source: stagedFile.source,
          licenseInfo: stagedFile.licenseInfo,
          durationSeconds: stagedFile.durationSeconds,
          vocalsPath: relVocals,
          instrumentalPath: relInst,
          modelUsed: separationResult.modelUsed || job.modelName,
          status: 'ready',
        },
        db
      );

      const completedAt = new Date().toISOString();
      db.prepare(
        `
        UPDATE jobs
        SET status = 'completed',
            stage = 'done',
            progress = 100,
            message = 'Separation complete! Added to your Library.',
            library_entry_id = ?,
            completed_at = ?
        WHERE id = ?
      `
      ).run(libraryEntry.id, completedAt, job.id);

      // Non-negotiable rule: remove the staged original once separation succeeds
      try {
        deleteStagedFile(stagedFile.id, { allowIfJobActive: true }, db);
      } catch {
        // Ignore if already removed
      }
    } catch (err) {
      if (!this.cancelledJobIds.has(job.id)) {
        if (err && err.code === 'ENOSPC') {
          this.markJobFailed(
            job.id,
            'DISK_FULL',
            'Your disk is full (not enough free storage space to save separated audio stems). Please free up disk space and try again.'
          );
        } else {
          this.markJobFailed(
            job.id,
            err.code || 'INTERNAL_JOB_ERROR',
            err.userMessage || err.message || 'An unexpected error occurred during separation.'
          );
        }
      }
    } finally {
      this.activeJobId = null;
      this.activeChildProcess = null;

      // Always clean up the temporary job folder inside storage/temp/
      if (fs.existsSync(jobTempDir)) {
        try {
          fs.rmSync(jobTempDir, { recursive: true, force: true });
        } catch {
          // Ignore brief lock
        }
      }
    }
  }

  moveFileSafe(srcPath, destPath) {
    try {
      fs.renameSync(srcPath, destPath);
    } catch {
      fs.copyFileSync(srcPath, destPath);
      fs.rmSync(srcPath, { force: true });
    }
  }

  markJobFailed(jobId, errorCode, errorMessage) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE jobs
      SET status = 'failed',
          stage = 'failed',
          error_code = ?,
          error_message = ?,
          message = ?,
          completed_at = ?
      WHERE id = ? AND status != 'cancelled'
    `
    ).run(errorCode, errorMessage, errorMessage, now, jobId);
  }

  spawnSeparatorProcess(jobId, pythonBin, args) {
    return new Promise((resolve) => {
      let completeEvent = null;
      let errorEvent = null;
      let stderrTail = '';

      let child;
      try {
        child = spawn(pythonBin, args, {
          cwd: config.paths.repoRoot,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (spawnErr) {
        return resolve({
          ok: false,
          errorCode: 'PYTHON_SPAWN_FAILED',
          errorMessage: `Failed to start Python separator process: ${spawnErr.message}`,
        });
      }

      this.activeChildProcess = child;

      // Always drain stderr so the OS pipe buffer (4–64 KB on Windows) never fills up
      // and blocks the Python child process during verbose model/chunk logging.
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          const text = chunk.toString('utf8');
          stderrTail = (stderrTail + text).slice(-1500);
        });
      }

      const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed.startsWith('{')) return;

        try {
          const event = JSON.parse(trimmed);
          if (this.cancelledJobIds.has(jobId)) return;

          if (event.type === 'progress') {
            const db = getDb();
            db.prepare(
              `
              UPDATE jobs
              SET stage = ?, progress = ?, message = ?
              WHERE id = ? AND status = 'running'
            `
            ).run(
              event.stage || 'separating',
              Number(event.percent) || 0,
              event.message || 'Processing audio...',
              jobId
            );
          } else if (event.type === 'complete') {
            completeEvent = event;
          } else if (event.type === 'error') {
            errorEvent = event;
          }
        } catch {
          // Ignore malformed stdout lines
        }
      });

      child.on('error', (err) => {
        resolve({
          ok: false,
          errorCode: 'PYTHON_PROCESS_ERROR',
          errorMessage: `Python process error: ${err.message}`,
        });
      });

      child.on('close', (exitCode) => {
        rl.close();

        if (this.cancelledJobIds.has(jobId)) {
          return resolve({
            ok: false,
            errorCode: 'JOB_CANCELLED',
            errorMessage: 'Separation was cancelled by the user.',
          });
        }

        if (exitCode === 0 && completeEvent) {
          return resolve({
            ok: true,
            vocalsPath: completeEvent.vocalsPath,
            instrumentalPath: completeEvent.instrumentalPath,
            modelUsed: completeEvent.modelUsed,
          });
        }

        if (errorEvent) {
          return resolve({
            ok: false,
            errorCode: errorEvent.code || `EXIT_${exitCode}`,
            errorMessage: errorEvent.message,
          });
        }

        return resolve({
          ok: false,
          errorCode: `EXIT_${exitCode ?? 'UNKNOWN'}`,
          errorMessage: `Audio separator exited unexpectedly (code ${exitCode}).`,
        });
      });
    });
  }
}

const jobQueue = new JobQueueManager();

module.exports = {
  JobQueueManager,
  jobQueue,
};
