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

function createTempTestEnv() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dunda-phase3-test-'));
  const libraryDir = path.join(rootDir, 'library');
  const tempDir = path.join(rootDir, 'temp');
  fs.mkdirSync(libraryDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  // Point config.paths.libraryDir and tempDir to isolated test folders
  config.paths.libraryDir = libraryDir;
  config.paths.tempDir = tempDir;

  const db = initDatabase(':memory:');
  setDbForTests(db);

  return { rootDir, libraryDir, tempDir, db };
}

test('Phase 3 — Library CRUD, duplicate naming, file streaming, deletion cleanup, and restart recovery', async (t) => {
  const { rootDir, libraryDir, tempDir, db } = createTempTestEnv();
  const app = createApp({ skipDbInit: true });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDb();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await t.test('1. Create Library entry sanitizes Windows characters and stores metadata', async () => {
    // Create dummy stem files inside libraryDir/entry-1/
    const entryDir = path.join(libraryDir, 'entry-1');
    fs.mkdirSync(entryDir, { recursive: true });
    fs.writeFileSync(path.join(entryDir, 'vocals.wav'), 'RIFF-dummy-vocals');
    fs.writeFileSync(
      path.join(entryDir, 'instrumental.wav'),
      'RIFF-dummy-instrumental'
    );

    const res = await fetch(`${baseUrl}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'entry-1',
        displayName: 'Swanee: Live <1920>?*',
        originalName: '03 Swanee.mp3',
        source: 'discover',
        licenseInfo: 'Public Domain Mark 1.0',
        durationSeconds: 160.53,
        vocalsPath: 'entry-1/vocals.wav',
        instrumentalPath: 'entry-1/instrumental.wav',
      }),
    });

    assert.equal(res.status, 201);
    const { item } = await res.json();
    assert.equal(item.id, 'entry-1');
    // Forbidden characters (: < > ? *) are stripped and collapsed cleanly
    assert.equal(item.displayName, 'Swanee Live 1920');
    assert.equal(item.licenseInfo, 'Public Domain Mark 1.0');
    assert.equal(item.modelUsed, 'UVR-MDX-NET-Inst_HQ_3.onnx');
  });

  await t.test('2. Creating duplicate displayName automatically appends (2) and (3)', async () => {
    for (const id of ['entry-2', 'entry-3']) {
      const dir = path.join(libraryDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'vocals.wav'), 'RIFF-dummy-vocals');
      fs.writeFileSync(path.join(dir, 'instrumental.wav'), 'RIFF-dummy-instrumental');
    }

    const res2 = await fetch(`${baseUrl}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'entry-2',
        displayName: 'Swanee Live 1920',
        originalName: '03 Swanee.mp3',
        source: 'upload',
        vocalsPath: 'entry-2/vocals.wav',
        instrumentalPath: 'entry-2/instrumental.wav',
      }),
    });
    assert.equal(res2.status, 201);
    const body2 = await res2.json();
    assert.equal(body2.item.displayName, 'Swanee Live 1920 (2)');

    const res3 = await fetch(`${baseUrl}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'entry-3',
        displayName: 'swanee live 1920', // Case-insensitive collision check
        originalName: '03 Swanee.mp3',
        source: 'upload',
        vocalsPath: 'entry-3/vocals.wav',
        instrumentalPath: 'entry-3/instrumental.wav',
      }),
    });
    assert.equal(res3.status, 201);
    const body3 = await res3.json();
    assert.equal(body3.item.displayName, 'swanee live 1920 (3)');
  });

  await t.test('3. Read & Search Library entries (GET /api/library and GET /api/library/:id)', async () => {
    const listRes = await fetch(`${baseUrl}/api/library`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.total, 3);

    const searchRes = await fetch(
      `${baseUrl}/api/library?search=${encodeURIComponent('(2)')}`
    );
    const searchBody = await searchRes.json();
    assert.equal(searchBody.total, 1);
    assert.equal(searchBody.items[0].id, 'entry-2');

    const singleRes = await fetch(`${baseUrl}/api/library/entry-1`);
    assert.equal(singleRes.status, 200);
    const singleBody = await singleRes.json();
    assert.equal(singleBody.item.originalName, '03 Swanee.mp3');
  });

  await t.test('4. Stream & download stems (GET /api/library/:id/audio/:stem)', async () => {
    const vocalsRes = await fetch(
      `${baseUrl}/api/library/entry-1/audio/vocals?download=1`
    );
    assert.equal(vocalsRes.status, 200);
    const disposition = vocalsRes.headers.get('content-disposition') || '';
    assert.match(disposition, /Swanee Live 1920 - vocals\.wav/);
    const content = await vocalsRes.text();
    assert.equal(content, 'RIFF-dummy-vocals');
  });

  await t.test('5. Update (PATCH /api/library/:id) renames entry and handles duplicate collision', async () => {
    const patchRes = await fetch(`${baseUrl}/api/library/entry-2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'My Custom Vocal Mix',
        notes: 'Great for karaoke practice',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.item.displayName, 'My Custom Vocal Mix');
    assert.equal(patchBody.item.notes, 'Great for karaoke practice');

    // Rename entry-3 to collide with entry-2's new name
    const collideRes = await fetch(`${baseUrl}/api/library/entry-3`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'My Custom Vocal Mix' }),
    });
    const collideBody = await collideRes.json();
    assert.equal(collideBody.item.displayName, 'My Custom Vocal Mix (2)');
  });

  await t.test('6. Reject path traversal and invalid inputs with clean 400/404 errors', async () => {
    const badPathRes = await fetch(`${baseUrl}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalName: 'hack.mp3',
        vocalsPath: '../../outside/secret.wav',
        instrumentalPath: 'entry-1/instrumental.wav',
      }),
    });
    assert.equal(badPathRes.status, 400);
    const badPathBody = await badPathRes.json();
    assert.equal(badPathBody.error.code, 'INVALID_PATH');

    const notFoundRes = await fetch(`${baseUrl}/api/library/non-existent-id`);
    assert.equal(notFoundRes.status, 404);
    const notFoundBody = await notFoundRes.json();
    assert.equal(notFoundBody.error.code, 'LIBRARY_ENTRY_NOT_FOUND');
  });

  await t.test('7. Delete (DELETE /api/library/:id) removes DB row AND audio files on disk', async () => {
    // First remove entry-2 and entry-3
    await fetch(`${baseUrl}/api/library/entry-2`, { method: 'DELETE' });
    await fetch(`${baseUrl}/api/library/entry-3`, { method: 'DELETE' });

    const entry1Dir = path.join(libraryDir, 'entry-1');
    assert.equal(fs.existsSync(entry1Dir), true);

    const delRes = await fetch(`${baseUrl}/api/library/entry-1`, {
      method: 'DELETE',
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.deleted, true);

    // Verify files and folder on disk are gone
    assert.equal(fs.existsSync(entry1Dir), false);

    // Verify DB row is gone
    const checkRes = await fetch(`${baseUrl}/api/library/entry-1`);
    assert.equal(checkRes.status, 404);
  });

  await t.test('8. Startup recovery marks interrupted jobs failed and cleans temp job-* folders', () => {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO jobs (id, custom_name, model_name, status, stage, progress, created_at)
      VALUES ('job-interrupted-1', 'Test Song', 'UVR-MDX-NET-Inst_HQ_3.onnx', 'running', 'separating', 55, ?)
    `
    ).run(now);

    const orphanJobDir = path.join(tempDir, 'job-interrupted-1');
    fs.mkdirSync(orphanJobDir, { recursive: true });
    fs.writeFileSync(path.join(orphanJobDir, 'partial.wav'), 'partial-data');

    const recovery = recoverInterruptedJobsAndCleanupTemp(db, tempDir);
    assert.equal(recovery.interruptedJobsMarkedFailed, 1);
    assert.equal(recovery.tempJobDirsRemoved, 1);
    assert.equal(fs.existsSync(orphanJobDir), false);

    const jobRow = db
      .prepare('SELECT status, error_code, error_message FROM jobs WHERE id = ?')
      .get('job-interrupted-1');
    assert.equal(jobRow.status, 'failed');
    assert.equal(jobRow.error_code, 'INTERRUPTED_BY_RESTART');
  });
});
