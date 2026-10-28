const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/index');

test('GET /api/health returns 200 and backend OK', async () => {
  const app = createApp({ skipDbInit: true });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.message, 'backend OK');
    assert.equal(body.app, 'Dunda na Fes');
    assert.equal(body.host, '127.0.0.1');
    assert.equal(body.sqlite.ok, true);
    assert.equal(body.models.defaultModel, 'UVR-MDX-NET-Inst_HQ_3.onnx');
    assert.equal(body.models.fallbackModel, 'Kim_Vocal_2.onnx');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
