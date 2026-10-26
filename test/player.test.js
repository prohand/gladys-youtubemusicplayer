import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_PLAYBACK_STATE, MUSIC_REPEAT_MODE } from '@gladysassistant/integration-sdk';
import { YtmClient } from '../src/ytmusic/client.js';
import { LINK_MODES, Player } from '../src/ytmusic/player.js';
import { createMemoryTokenStore } from '../src/ytmusic/tokens.js';
import { FakeYtmApp, SONG, flush, manualTimers } from './helpers/fakeYtm.js';

function setup(appOptions, { webSocket = true } = {}) {
  const app = new FakeYtmApp(appOptions);
  const timers = manualTimers();
  const player = new Player({
    id: '192-168-1-20-26538',
    name: 'Living room',
    client: new YtmClient({
      host: '192.168.1.20',
      port: 26538,
      clientId: 'gladys-test',
      tokens: createMemoryTokenStore(),
      fetch: app.fetch,
    }),
    WebSocket: webSocket ? app.WebSocket : null,
    timers,
  });
  const events = [];
  for (const name of ['update', 'track', 'playback', 'online', 'offline', 'mode']) {
    player.on(name, (value) => events.push([name, value]));
  }
  return { app, player, timers, events };
}

test('the live link reads the full state from PLAYER_INFO', async () => {
  const { player, events } = setup();
  player.start();
  await flush();
  await flush();
  assert.equal(player.mode, LINK_MODES.LIVE);
  assert.deepEqual(
    events.filter(([name]) => name !== 'update').map(([name]) => name),
    ['online', 'track', 'playback'],
  );
  assert.deepEqual(player.nowPlaying(), {
    playback_state: MUSIC_PLAYBACK_STATE.PLAYING,
    title: 'Get Lucky',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    artwork_url: 'https://lh3.googleusercontent.com/abc=w400-h400-l90-rj',
    duration: 369,
    position: 12,
    shuffle: false,
    repeat: MUSIC_REPEAT_MODE.OFF,
    mute: false,
    volume: 40,
  });
  player.stop();
});

test('live messages update the state and emit only real changes', async () => {
  const { app, player, events } = setup();
  player.start();
  await flush();
  await flush();
  events.length = 0;

  app.push({ type: 'POSITION_CHANGED', position: 50 });
  app.push({ type: 'PLAYER_STATE_CHANGED', isPlaying: false, position: 51 });
  app.push({
    type: 'VIDEO_CHANGED',
    song: { ...SONG, videoId: 'dQw4w9WgXcQ', title: 'Never' },
    position: 0,
  });
  app.push({ type: 'VOLUME_CHANGED', volume: 70, muted: true });
  app.push({ type: 'REPEAT_CHANGED', repeat: 'ONE' });
  app.push({ type: 'SHUFFLE_CHANGED', shuffle: true });
  app.push({ type: 'SOMETHING_NEW' });

  assert.deepEqual(
    events.filter(([name]) => name !== 'update'),
    [
      ['playback', false],
      ['track', { ...SONG, videoId: 'dQw4w9WgXcQ', title: 'Never' }],
    ],
  );
  const now = player.nowPlaying();
  assert.equal(now.playback_state, MUSIC_PLAYBACK_STATE.PAUSED);
  assert.equal(now.title, 'Never');
  assert.equal(now.position, 0);
  assert.equal(now.volume, 70);
  assert.equal(now.mute, true);
  assert.equal(now.repeat, MUSIC_REPEAT_MODE.ONE);
  assert.equal(now.shuffle, true);
  player.stop();
});

test('a closed app turns the player offline, and it comes back', async () => {
  const { app, player, timers, events } = setup();
  player.start();
  await flush();
  await flush();

  app.goAway();
  assert.equal(player.mode, LINK_MODES.OFFLINE);
  assert.equal(player.nowPlaying().playback_state, MUSIC_PLAYBACK_STATE.IDLE);
  assert.ok(events.some(([name]) => name === 'offline'));
  assert.equal(timers.pending.size, 1, 'a reconnection is scheduled');

  // Still closed: the retry fails and waits longer.
  await timers.runAll();
  await flush();
  assert.equal(player.mode, LINK_MODES.OFFLINE);

  app.reachable = true;
  await timers.runAll();
  await flush();
  await flush();
  assert.equal(player.mode, LINK_MODES.LIVE);
  assert.equal(events.filter(([name]) => name === 'online').length, 2);
  player.stop();
  assert.equal(timers.pending.size, 0, 'stop clears the timers');
});

test('without a WebSocket the player polls the REST routes', async () => {
  const { app, player, timers } = setup({ webSocket: false });
  player.start();
  for (let i = 0; i < 6; i += 1) {
    await flush();
  }
  assert.equal(player.mode, LINK_MODES.POLLING);
  assert.equal(player.song.title, 'Get Lucky');
  assert.equal(player.volume, 40);
  assert.equal(timers.pending.size, 1, 'the next read is scheduled');

  app.song = { ...SONG, isPaused: true };
  await timers.runAll();
  for (let i = 0; i < 6; i += 1) {
    await flush();
  }
  assert.equal(player.isPlaying, false);
  player.stop();
});

test('a player without WebSocket support at all polls too', async () => {
  const { player } = setup({}, { webSocket: false });
  await player.connect();
  assert.equal(player.mode, LINK_MODES.OFFLINE, 'not running: nothing happens');
  player.start();
  for (let i = 0; i < 6; i += 1) {
    await flush();
  }
  assert.equal(player.mode, LINK_MODES.POLLING);
  player.stop();
});

test('a refused token over the WebSocket is forgotten', async () => {
  const { app, player } = setup();
  player.start();
  await flush();
  await flush();
  assert.equal(player.mode, LINK_MODES.LIVE);
  // The secret of the app changed: the next socket is refused.
  app.token = 'token-2';
  [...app.sockets].forEach((socket) => socket.close(1008));
  assert.equal(player.client.hasToken(), false);
  player.stop();
});

test('after Deny the player stops asking, until it is restarted', async () => {
  const { app, player, timers } = setup({ auth: 'deny' });
  player.start();
  await flush();
  await flush();
  assert.equal(player.mode, LINK_MODES.OFFLINE);
  assert.equal(app.authRequests, 1);
  assert.equal(timers.pending.size, 0, 'no retry would pop the dialog again');

  // "Authorize a player": the user clicks Allow this time.
  app.auth = 'allow';
  player.stop();
  player.start();
  await flush();
  await flush();
  assert.equal(player.mode, LINK_MODES.LIVE);
  player.stop();
});

test('nothing loaded is idle with empty texts', async () => {
  const { app, player } = setup();
  app.song = null;
  player.start();
  await flush();
  await flush();
  const now = player.nowPlaying();
  assert.equal(now.playback_state, MUSIC_PLAYBACK_STATE.IDLE);
  assert.equal(now.title, '');
  assert.equal(now.artwork_url, null);
  player.stop();
});
