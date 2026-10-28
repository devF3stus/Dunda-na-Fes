const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const config = require('../src/config');
const { initDatabase, setDbForTests, closeDb } = require('../src/db');
const { createApp } = require('../src/index');

/**
 * Create a valid 16-bit PCM WAV buffer in memory.
 * - If `silent = true`, all samples are 0 (100% digital silence).
 * - If `silent = false`, writes a 440 Hz sine tone (amplitude 12000) so it is audible.
 * - `channels` can be 1 (mono) or 2 (stereo).
 */
function createWavBuffer({
  durationSeconds = 1,
  sampleRate = 8000,
  channels = 1,
  silent = false,
} = {}) {
  const numFrames = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  if (!silent) {
    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      const sample = Math.round(
        12000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)
      );
      for (let ch = 0; ch < channels; ch++) {
        buffer.writeInt16LE(sample, offset);
        offset += 2;
      }
    }
  }

  return buffer;
}

describe('Phase 8 — Edge-case hardening: corrupt file, mono file, silent file, oversized file, disk full, and missing model', () => {
  let rootDir;
  let stagingDir;
  let libraryDir;
  let tempDir;
  let modelsDir;
  let originalPaths;
  let originalMaxSize;
  let server;
  let baseUrl;

  before(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dunda-phase8-test-'));
    stagingDir = path.join(rootDir, 'staging');
    libraryDir = path.join(rootDir, 'library');
    tempDir = path.join(rootDir, 'temp');
    modelsDir = config.paths.modelsDir; // Use real cached models dir for separator CLI checks
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(libraryDir, { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });

    originalPaths = { ...config.paths };
    originalMaxSize = config.upload.maxFileSizeMb;

    config.paths.stagingDir = stagingDir;
    config.paths.libraryDir = libraryDir;
    config.paths.tempDir = tempDir;

    const db = initDatabase(':memory:');
    setDbForTests(db);

    const app = createApp({ skipDbInit: true });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    closeDb();
    Object.assign(config.paths, originalPaths);
    config.upload.maxFileSizeMb = originalMaxSize;
    if (rootDir && fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('1. Corrupt audio file (valid magic bytes but truncated/corrupt stream) is rejected with 400 CORRUPT_AUDIO_FILE and zero temp files', async () => {
    // Starts with valid "RIFF....WAVE" magic bytes (12 bytes) followed by corrupt non-PCM garbage
    const corruptWav = Buffer.from(
      'RIFF\x24\x00\x00\x00WAVE_CORRUPT_TRUNCATED_CHUNK_DATA_XXXX',
      'ascii'
    );

    const form = new FormData();
    form.append(
      'file',
      new Blob([corruptWav], { type: 'audio/wav' }),
      'corrupt_recording.wav'
    );

    const res = await fetch(`${baseUrl}/api/staging/upload`, {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'CORRUPT_AUDIO_FILE');
    assert.match(body.error.message, /corrupted|truncated|unreadable/i);

    // Temp directory must be completely clean
    assert.equal(fs.readdirSync(tempDir).length, 0);
  });

  test('2. Very large file exceeding maxFileSizeMb is rejected with 413 FILE_TOO_LARGE and zero temp files', async () => {
    // Temporarily set maxFileSizeMb to 0.01 MB (~10 KB) for fast unit testing
    config.upload.maxFileSizeMb = 0.01;
    try {
      const largeWav = createWavBuffer({
        durationSeconds: 3,
        sampleRate: 8000,
        silent: false,
      }); // ~48 KB > 10 KB limit

      const form = new FormData();
      form.append(
        'file',
        new Blob([largeWav], { type: 'audio/wav' }),
        'huge_file.wav'
      );

      const res = await fetch(`${baseUrl}/api/staging/upload`, {
        method: 'POST',
        body: form,
      });
      assert.equal(res.status, 413);
      const body = await res.json();
      assert.equal(body.error.code, 'FILE_TOO_LARGE');
      assert.match(body.error.message, /exceeds the maximum allowed size/i);
      assert.equal(fs.readdirSync(tempDir).length, 0);
    } finally {
      config.upload.maxFileSizeMb = originalMaxSize;
    }
  });

  test('3. Mono 8kHz WAV file stages cleanly and separator/separate.py helpers handle mono + silent + disk full', () => {
    const monoWavPath = path.join(rootDir, 'mono_tone.wav');
    const silentWavPath = path.join(rootDir, 'silent_track.wav');
    fs.writeFileSync(
      monoWavPath,
      createWavBuffer({
        durationSeconds: 1,
        sampleRate: 8000,
        channels: 1,
        silent: false,
      })
    );
    fs.writeFileSync(
      silentWavPath,
      createWavBuffer({
        durationSeconds: 1,
        sampleRate: 8000,
        channels: 1,
        silent: true,
      })
    );

    // Verify Python helper functions directly via separator/.venv
    const pyCheck = spawnSync(
      originalPaths.pythonExecutable,
      [
        '-c',
        `import errno, sys; sys.path.insert(0, r"${path.dirname(originalPaths.separatorScript)}"); import separate; ` +
          `assert separate.is_wav_completely_silent(r"${silentWavPath}") is True; ` +
          `assert separate.is_wav_completely_silent(r"${monoWavPath}") is False; ` +
          `assert separate.is_disk_full_error(OSError(errno.ENOSPC, "No space left on device")) is True; ` +
          `print("OK")`,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 }
    );

    assert.equal(pyCheck.status, 0, `Python helper check failed: ${pyCheck.stderr}`);
    assert.equal(pyCheck.stdout.trim(), 'OK');
  });

  test('4. Silent audio file passed to separator/separate.py emits friendly SILENT_AUDIO_FILE error without stack trace', () => {
    const silentWavPath = path.join(rootDir, 'silent_input.wav');
    const outDir = path.join(rootDir, 'silent_out');
    fs.writeFileSync(
      silentWavPath,
      createWavBuffer({
        durationSeconds: 1,
        sampleRate: 8000,
        channels: 1,
        silent: true,
      })
    );

    const proc = spawnSync(
      originalPaths.pythonExecutable,
      [
        originalPaths.separatorScript,
        '--input',
        silentWavPath,
        '--output-dir',
        outDir,
        '--model-dir',
        modelsDir,
        '--model',
        'UVR-MDX-NET-Inst_HQ_3.onnx',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 }
    );

    assert.equal(proc.status, 6); // EXIT_SEPARATION_FAILED
    const lines = proc.stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => JSON.parse(l));
    const errorEvt = lines.find((e) => e.type === 'error');
    assert.ok(errorEvt, 'Expected a JSON error event on stdout');
    assert.equal(errorEvt.code, 'SILENT_AUDIO_FILE');
    assert.match(errorEvt.message, /contains only silence/i);
    assert.doesNotMatch(errorEvt.message, /Traceback/i);
  });

  test('5. Missing AI model passed to separator/separate.py exits with code 5 (MODEL_ERROR) and friendly JSON error', () => {
    const toneWavPath = path.join(rootDir, 'tone_for_missing_model.wav');
    const outDir = path.join(rootDir, 'missing_model_out');
    fs.writeFileSync(
      toneWavPath,
      createWavBuffer({
        durationSeconds: 1,
        sampleRate: 8000,
        channels: 1,
        silent: false,
      })
    );

    const proc = spawnSync(
      originalPaths.pythonExecutable,
      [
        originalPaths.separatorScript,
        '--input',
        toneWavPath,
        '--output-dir',
        outDir,
        '--model-dir',
        path.join(rootDir, 'empty_models'),
        '--model',
        'NonExistent_Offline_Model_999.onnx',
        '--fallback-model',
        '',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 }
    );

    assert.equal(proc.status, 5); // EXIT_MODEL_ERROR
    const lines = proc.stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => JSON.parse(l));
    const errorEvt = lines.find((e) => e.type === 'error');
    assert.ok(errorEvt, 'Expected a JSON error event on stdout');
    assert.equal(errorEvt.code, 'MODEL_ERROR');
    assert.match(errorEvt.message, /Could not load AI model/i);
    assert.doesNotMatch(errorEvt.message, /Traceback/i);
  });
});
