const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initDatabase, setDbForTests, closeDb } = require('../src/db');
const {
  searchOpenMusic,
  downloadDiscoverTrackToStaging,
  validateAllowedDiscoverAudioUrl,
  formatLicenseLabelFromUrl,
} = require('../src/services/discoverService');

/**
 * Create a valid 1-second 8kHz mono 16-bit PCM WAV buffer in memory.
 */
function createValidWavBuffer(durationSeconds = 1) {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

describe('Phase 7 — Discover legal music search, license metadata, SSRF safety, and staging', () => {
  let tempRoot;
  let db;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dunda-phase7-test-'));
    db = initDatabase(':memory:');
    setDbForTests(db);
  });

  after(() => {
    closeDb();
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('1. Format license labels and enforce strict SSRF domain allowlist', () => {
    assert.equal(
      formatLicenseLabelFromUrl('https://creativecommons.org/licenses/by-sa/4.0/'),
      'CC BY-SA 4.0'
    );
    assert.equal(
      formatLicenseLabelFromUrl('http://creativecommons.org/publicdomain/mark/1.0/'),
      'Public Domain'
    );
    assert.equal(
      formatLicenseLabelFromUrl('https://creativecommons.org/publicdomain/zero/1.0/'),
      'CC0 1.0 Public Domain'
    );

    // Approved domains pass
    assert.ok(
      validateAllowedDiscoverAudioUrl('https://archive.org/download/item123/song.mp3')
    );
    assert.ok(
      validateAllowedDiscoverAudioUrl(
        'https://upload.wikimedia.org/wikipedia/commons/a/ab/Song.ogg'
      )
    );

    // Unapproved domains or non-HTTPS protocols are rejected
    assert.throws(
      () => validateAllowedDiscoverAudioUrl('https://www.youtube.com/watch?v=123'),
      (err) => err.code === 'UNAPPROVED_SOURCE_DOMAIN'
    );
    assert.throws(
      () => validateAllowedDiscoverAudioUrl('http://archive.org/download/item123/song.mp3'),
      (err) => err.code === 'UNSAFE_AUDIO_URL'
    );
    assert.throws(
      () => validateAllowedDiscoverAudioUrl('https://127.0.0.1:3001/api/health'),
      (err) => err.code === 'UNAPPROVED_SOURCE_DOMAIN'
    );
  });

  test('2. Search both Internet Archive and Wikimedia Commons with per-track licenses', async () => {
    const mockFetch = async (url) => {
      const str = String(url);
      if (str.includes('archive.org/advancedsearch.php')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              docs: [
                {
                  identifier: 'gospel_quartet_1928',
                  title: 'Swing Low Sweet Chariot',
                  creator: 'Fisk Jubilee Quartet',
                  licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/',
                },
              ],
            },
          }),
        };
      }
      if (str.includes('archive.org/metadata/gospel_quartet_1928')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            files: [
              {
                name: 'swing_low.mp3',
                size: '3145728',
                length: '03:05',
              },
            ],
          }),
        };
      }
      if (str.includes('commons.wikimedia.org/w/api.php')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            query: {
              pages: {
                101: {
                  pageid: 101,
                  title: 'File:Amazing Grace Choir.oga',
                  imageinfo: [
                    {
                      url: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Amazing_Grace_Choir.oga',
                      size: 2048000,
                      duration: 142.4,
                      descriptionurl:
                        'https://commons.wikimedia.org/wiki/File:Amazing_Grace_Choir.oga',
                      extmetadata: {
                        ObjectName: { value: 'Amazing Grace Choir' },
                        Artist: { value: '<b>Community Choir</b>' },
                        LicenseShortName: { value: 'CC BY 4.0' },
                        LicenseUrl: {
                          value: 'https://creativecommons.org/licenses/by/4.0/',
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected URL: ${str}`);
    };

    const { items, warnings } = await searchOpenMusic(
      { query: 'gospel choir', source: 'both', limit: 6 },
      mockFetch
    );

    assert.equal(warnings.length, 0);
    assert.equal(items.length, 2);

    const iaTrack = items.find((i) => i.sourceId === 'archive');
    assert.ok(iaTrack);
    assert.equal(iaTrack.title, 'Swing Low Sweet Chariot');
    assert.equal(iaTrack.artist, 'Fisk Jubilee Quartet');
    assert.equal(iaTrack.licenseLabel, 'Public Domain');
    assert.equal(iaTrack.durationSeconds, 185);
    assert.equal(iaTrack.format, 'MP3');

    const wmTrack = items.find((i) => i.sourceId === 'wikimedia');
    assert.ok(wmTrack);
    assert.equal(wmTrack.title, 'Amazing Grace Choir');
    assert.equal(wmTrack.artist, 'Community Choir');
    assert.equal(wmTrack.licenseLabel, 'CC BY 4.0');
    assert.equal(wmTrack.format, 'OGG');
  });

  test('3. Download discovered track into Staging validates magic bytes and preserves licenseInfo', async () => {
    const wavBytes = createValidWavBuffer(2);
    const stagingDir = path.join(tempRoot, 'staging');
    const tempDir = path.join(tempRoot, 'temp');

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-length', String(wavBytes.length)]]),
      arrayBuffer: async () =>
        wavBytes.buffer.slice(
          wavBytes.byteOffset,
          wavBytes.byteOffset + wavBytes.byteLength
        ),
    });

    const staged = await downloadDiscoverTrackToStaging(
      {
        title: 'Swing Low Sweet Chariot',
        artist: 'Fisk Jubilee Quartet',
        audioUrl: 'https://archive.org/download/gospel_quartet_1928/swing_low.wav',
        licenseInfo:
          'Public Domain (Internet Archive • http://creativecommons.org/publicdomain/mark/1.0/)',
      },
      { db, stagingDir, tempDir, fetchImpl: mockFetch }
    );

    assert.ok(staged.id);
    assert.equal(staged.source, 'discover');
    assert.equal(
      staged.licenseInfo,
      'Public Domain (Internet Archive • http://creativecommons.org/publicdomain/mark/1.0/)'
    );
    assert.equal(
      staged.suggestedName,
      'Fisk Jubilee Quartet - Swing Low Sweet Chariot'
    );
    assert.ok(staged.durationSeconds >= 1.5 && staged.durationSeconds <= 2.5);

    // Temp directory should have zero leftover discover-* files
    const leftoverTemp = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith('discover-'));
    assert.equal(leftoverTemp.length, 0);
  });
});
