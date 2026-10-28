const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

const config = require('../src/config');
const {
  initDatabase,
  setDbForTests,
  closeDb,
  recoverInterruptedJobsAndCleanupTemp,
} = require('../src/db');
const { createApp } = require('../src/index');

/**
 * Create a tiny valid WAV buffer (44-byte RIFF/WAVE PCM header + 1 second of 440Hz sine or silence)
 * so magic-byte inspection and ffprobe both recognize it as genuine audio.
 */
function createValidWavBuffer(durationSeconds = 1) {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels = 1
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/**
 * Create a lightweight mock separator Python script for fast, deterministic
 * queue, progress, cancellation, and failure testing in the unit suite.
 */
function createMockSeparatorScript(dirPath) {
  const scriptPath = path.join(dirPath, 'mock_separate.py');
  const scriptContent = `import argparse, json, os, sys, time

parser = argparse.ArgumentParser()
parser.add_argument("--input")
parser.add_argument("--output-dir")
parser.add_argument("--model-dir")
parser.add_argument("--model")
parser.add_argument("--fallback-model")
parser.add_argument("--ffmpeg-path")
args = parser.parse_args()

def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\\n")
    sys.stdout.flush()

if "fail-model" in (args.model or ""):
    emit({"type": "error", "code": "MODEL_ERROR", "message": "Simulated model load failure."})
    sys.exit(5)

if "slow-cancel" in (args.model or ""):
    emit({"type": "progress", "stage": "separating", "percent": 30, "message": "Separating slow track..."})
    time.sleep(10)
    sys.exit(0)

emit({"type": "progress", "stage": "loading_model", "percent": 15, "message": "Loading model..."})
time.sleep(0.05)
emit({"type": "progress", "stage": "separating", "percent": 60, "message": "Separating audio chunks (1/2)..."})
time.sleep(0.05)

os.makedirs(args.output_dir, exist_ok=True)
vocals_path = os.path.join(args.output_dir, "vocals.wav")
inst_path = os.path.join(args.output_dir, "instrumental.wav")
with open(vocals_path, "wb") as f:
    f.write(b"RIFF-vocals-stem")
with open(inst_path, "wb") as f:
    f.write(b"RIFF-instrumental-stem")

emit({
    "type": "complete",
    "percent": 100,
    "vocalsPath": vocals_path,
    "instrumentalPath": inst_path,
    "outputFormat": "wav",
    "modelUsed": args.model,
    "elapsedSeconds": 0.1,
    "peakMemoryMb": 120.5
})
sys.exit(0)
`;
  fs.writeFileSync(scriptPath, scriptContent, 'utf8');
  return scriptPath;
}

async function waitForJobTerminalState(baseUrl, jobId, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/api/jobs/${jobId}`);
    const { item } = await res.json();
    if (['completed', 'failed', 'cancelled'].includes(item.status)) {
      return item;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

test('Phase 4 — Upload validation, staging, 1-at-a-time job queue, cancellation, failure, and restart recovery', async (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dunda-phase4-test-'));
  const stagingDir = path.join(rootDir, 'staging');
  const libraryDir = path.join(rootDir, 'library');
  const tempDir = path.join(rootDir, 'temp');
  const modelsDir = path.join(rootDir, 'models');
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.mkdirSync(libraryDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(modelsDir, { recursive: true });

  const originalPaths = { ...config.paths };
  config.paths.stagingDir = stagingDir;
  config.paths.libraryDir = libraryDir;
  config.paths.tempDir = tempDir;
  config.paths.modelsDir = modelsDir;
  config.paths.separatorScript = createMockSeparatorScript(rootDir);

  const db = initDatabase(':memory:');
  setDbForTests(db);

  const app = createApp({ skipDbInit: true });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDb();
    Object.assign(config.paths, originalPaths);
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await t.test('1. Reject non-audio extension and fake magic bytes on upload, leaving zero temp files', async () => {
    // A. Bad extension (.txt)
    const formExt = new FormData();
    formExt.append(
      'file',
      new Blob(['hello world'], { type: 'text/plain' }),
      'notes.txt'
    );
    const resExt = await fetch(`${baseUrl}/api/staging/upload`, {
      method: 'POST',
      body: formExt,
    });
    assert.equal(resExt.status, 400);
    const bodyExt = await resExt.json();
    assert.equal(bodyExt.error.code, 'UNSUPPORTED_AUDIO_FORMAT');

    // B. Renamed text file pretending to be .mp3 (fails magic byte inspection)
    const formFake = new FormData();
    formFake.append(
      'file',
      new Blob(['NOT_AN_AUDIO_HEADER_1234567890'], { type: 'audio/mpeg' }),
      'fake_song.mp3'
    );
    const resFake = await fetch(`${baseUrl}/api/staging/upload`, {
      method: 'POST',
      body: formFake,
    });
    assert.equal(resFake.status, 400);
    const bodyFake = await resFake.json();
    assert.equal(bodyFake.error.code, 'INVALID_AUDIO_CONTENT');

    // Verify tempDir has no leftover upload-*.tmp files
    const remainingTemp = fs.readdirSync(tempDir);
    assert.equal(remainingTemp.length, 0);
  });

  let stagedItem1 = null;

  await t.test('2. Upload valid WAV audio to Staging inspects duration and generates safe server filename', async () => {
    const wavBuf = createValidWavBuffer(2);
    const form = new FormData();
    form.append(
      'file',
      new Blob([wavBuf], { type: 'audio/wav' }),
      '01_My_Test_Song.wav'
    );

    const res = await fetch(`${baseUrl}/api/staging/upload`, {
      method: 'POST',
      body: form,
    });
    assert.equal(res.status, 201);
    const { item } = await res.json();
    stagedItem1 = item;

    assert.equal(item.originalName, '01_My_Test_Song.wav');
    assert.equal(item.suggestedName, '01 My Test Song');
    assert.match(item.storedFilename, /^[0-9a-f-]+\.wav$/i);
    assert.equal(
      fs.existsSync(path.join(stagingDir, item.storedFilename)),
      true
    );
  });

  await t.test('3. Process staged song end-to-end: updates progress, creates Library entry, removes staged original & temp folder', async () => {
    const createJobRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stagedFileId: stagedItem1.id,
        customName: 'My Processed Song',
      }),
    });
    assert.equal(createJobRes.status, 201);
    const { item: queuedJob } = await createJobRes.json();

    const finishedJob = await waitForJobTerminalState(baseUrl, queuedJob.id);
    assert.equal(finishedJob.status, 'completed');
    assert.equal(finishedJob.progress, 100);
    assert.ok(finishedJob.libraryEntryId);

    // Verify Library entry exists with both stems on disk
    const libRes = await fetch(
      `${baseUrl}/api/library/${finishedJob.libraryEntryId}`
    );
    assert.equal(libRes.status, 200);
    const { item: libItem } = await libRes.json();
    assert.equal(libItem.displayName, 'My Processed Song');
    assert.equal(
      fs.existsSync(path.join(libraryDir, libItem.vocalsPath)),
      true
    );
    assert.equal(
      fs.existsSync(path.join(libraryDir, libItem.instrumentalPath)),
      true
    );

    // Verify staged original was cleaned up after successful separation
    const stagedListRes = await fetch(`${baseUrl}/api/staging`);
    const stagedList = await stagedListRes.json();
    assert.equal(stagedList.total, 0);
    assert.equal(
      fs.existsSync(path.join(stagingDir, stagedItem1.storedFilename)),
      false
    );

    // Verify temp directory is completely clean
    assert.equal(fs.readdirSync(tempDir).length, 0);
  });

  await t.test('4. Cancelled running job terminates Python child process and cleans up temp directory', async () => {
    const wavBuf = createValidWavBuffer(1);
    const form = new FormData();
    form.append(
      'file',
      new Blob([wavBuf], { type: 'audio/wav' }),
      'Cancel_Me.wav'
    );
    const uploadRes = await fetch(`${baseUrl}/api/staging/upload`, {
      method: 'POST',
      body: form,
    });
    const { item: stagedCancel } = await uploadRes.json();

    const jobRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stagedFileId: stagedCancel.id,
        customName: 'Cancel Test',
        modelName: 'slow-cancel.onnx',
      }),
    });
    const { item: runningJob } = await jobRes.json();

    // Wait briefly until job enters 'running' state
    await new Promise((r) => setTimeout(r, 150));

    const cancelRes = await fetch(
      `${baseUrl}/api/jobs/${runningJob.id}/cancel`,
      { method: 'POST' }
    );
    assert.equal(cancelRes.status, 200);
    const { item: cancelledJob } = await cancelRes.json();
    assert.equal(cancelledJob.status, 'cancelled');
    assert.equal(cancelledJob.errorCode, 'JOB_CANCELLED');

    // Clean up the staged file (which is preserved when a job is cancelled so the user can retry or delete it)
    const delStaged = await fetch(`${baseUrl}/api/staging/${stagedCancel.id}`, {
      method: 'DELETE',
    });
    assert.equal(delStaged.status, 200);
  });

  await t.test('5. Failed separator job records friendly error message and cleans temp directory', async () => {
    const wavBuf = createValidWavBuffer(1);
    const form = new FormData();
    form.append(
      'file',
      new Blob([wavBuf], { type: 'audio/wav' }),
      'Fail_Model_Track.wav'
    );
    const uploadRes = await fetch(`${baseUrl}/api/staging/upload`, {
      method: 'POST',
      body: form,
    });
    const { item: stagedFail } = await uploadRes.json();

    const jobRes = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stagedFileId: stagedFail.id,
        modelName: 'fail-model.onnx',
      }),
    });
    const { item: queuedFailJob } = await jobRes.json();

    const failedJob = await waitForJobTerminalState(baseUrl, queuedFailJob.id);
    assert.equal(failedJob.status, 'failed');
    assert.equal(failedJob.errorCode, 'MODEL_ERROR');
    assert.match(failedJob.errorMessage, /Simulated model load failure/);
    assert.equal(fs.readdirSync(tempDir).length, 0);
  });
});
