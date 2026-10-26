import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccessDeniedError,
  ApiError,
  QUEUE_POSITIONS,
  UnreachableError,
  YtmClient,
} from '../src/ytmusic/client.js';
import { createMemoryTokenStore } from '../src/ytmusic/tokens.js';
import { FakeYtmApp } from './helpers/fakeYtm.js';

function setup(appOptions, tokens = createMemoryTokenStore()) {
  const app = new FakeYtmApp(appOptions);
  const client = new YtmClient({
    host: '192.168.1.20',
    port: 26538,
    clientId: 'gladys-test',
    tokens,
    fetch: app.fetch,
  });
  return { app, client, tokens };
}

test('the first request asks for a token once, then reuses it', async () => {
  const { app, client, tokens } = setup();
  await client.next();
  await client.previous();
  assert.equal(app.authRequests, 1);
  assert.equal(tokens.get('192.168.1.20:26538'), 'token-1');
  assert.deepEqual(app.calls('POST', '/auth/gladys-test').length, 1);
  assert.equal(app.calls('POST', '/api/v1/next')[0].headers.Authorization, 'Bearer token-1');
});

test('concurrent requests share one authorization dialog', async () => {
  const { app, client } = setup();
  await Promise.all([client.play(), client.getSong(), client.getVolume()]);
  assert.equal(app.authRequests, 1);
});

test('a revoked token is asked again once', async () => {
  const tokens = createMemoryTokenStore({ '192.168.1.20:26538': 'old' });
  const { app, client } = setup({}, tokens);
  const song = await client.getSong();
  assert.equal(song.title, 'Get Lucky');
  assert.equal(app.authRequests, 1);
  assert.equal(tokens.get('192.168.1.20:26538'), 'token-1');
});

test('Deny in the app is an AccessDeniedError', async () => {
  const { client } = setup({ auth: 'deny' });
  await assert.rejects(client.play(), AccessDeniedError);
});

test('an app that does not answer is an UnreachableError', async () => {
  const { app, client } = setup();
  app.reachable = false;
  await assert.rejects(client.play(), UnreachableError);
});

test('an unexpected status is an ApiError', async () => {
  const { client } = setup();
  await assert.rejects(client.request('GET', '/nope'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    return true;
  });
});

test('commands send the bodies the plugin expects', async () => {
  const { app, client } = setup();
  await client.seekTo(42);
  await client.setVolume(30);
  await client.switchRepeat(2);
  await client.addToQueue('dQw4w9WgXcQ', QUEUE_POSITIONS.NEXT);
  await client.setQueueIndex(1);
  await client.search('daft punk');
  assert.deepEqual(app.calls('POST', '/api/v1/seek-to')[0].body, { seconds: 42 });
  assert.deepEqual(app.calls('POST', '/api/v1/volume')[0].body, { volume: 30 });
  assert.deepEqual(app.calls('POST', '/api/v1/switch-repeat')[0].body, { iteration: 2 });
  assert.deepEqual(app.calls('POST', '/api/v1/queue')[0].body, {
    videoId: 'dQw4w9WgXcQ',
    insertPosition: 'INSERT_AFTER_CURRENT_VIDEO',
  });
  assert.deepEqual(app.calls('PATCH', '/api/v1/queue')[0].body, { index: 1 });
  assert.deepEqual(app.calls('POST', '/api/v1/search')[0].body, { query: 'daft punk' });
});

test('an empty answer (204) resolves null', async () => {
  const { app, client } = setup();
  app.song = null;
  assert.equal(await client.getSong(), null);
});

test('the WebSocket URL carries the token', async () => {
  const { client } = setup();
  assert.equal(client.webSocketUrl(), 'ws://192.168.1.20:26538/api/v1/ws');
  await client.ensureToken();
  assert.equal(client.webSocketUrl(), 'ws://192.168.1.20:26538/api/v1/ws?token=token-1');
});
