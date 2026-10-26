import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { setPlayerValue } from '../src/devices/player.js';
import { settle, setupHub } from './helpers/setup.js';

const MUSIC = DEVICE_FEATURE_TYPES.MUSIC;

test('Gladys accepts the discovery payload of the players', async () => {
  const { gladys, hub } = await setupHub({ players: 'A=10.0.0.1, B=10.0.0.2:9000', start: false });
  // The fake Gladys refuses what the host API refuses (unknown category,
  // type or unit) with the same 400.
  await gladys.publishDiscoveredDevices(hub.buildDevices());
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.external_id),
    ['ext:youtube-music:player:10-0-0-1-26538', 'ext:youtube-music:player:10-0-0-2-9000'],
  );
  assert.deepEqual(devices[1].params, [{ name: 'address', value: '10.0.0.2:9000' }]);
});

test('every feature declares min and max, and follows the publishNowPlaying ids', async () => {
  const { hub } = await setupHub({ start: false });
  const [device] = hub.buildDevices();
  for (const feature of device.features) {
    assert.equal(typeof feature.min, 'number', `${feature.type} min`);
    assert.equal(typeof feature.max, 'number', `${feature.type} max`);
    assert.equal(feature.external_id, `${device.external_id}:${feature.type}`);
    assert.equal(feature.category, 'music');
    assert.equal(feature.has_feedback, !feature.read_only);
  }
  const types = device.features.map((feature) => feature.type);
  for (const type of ['title', 'artist', 'album', 'artwork', 'playback_state', 'position']) {
    assert.ok(types.includes(type), `${type} feature`);
  }
});

test('commands reach the app', async () => {
  const { app, hub } = await setupHub();
  const [player] = hub.list();
  const set = (type, value) => setPlayerValue(player, { type }, value);

  await set(MUSIC.PLAYBACK_STATE, 0);
  await set(MUSIC.PLAYBACK_STATE, 1);
  await set(MUSIC.PLAYBACK_STATE, 2);
  await set(MUSIC.PLAY, 1);
  await set(MUSIC.PAUSE, 1);
  await set(MUSIC.NEXT, 1);
  await set(MUSIC.PREVIOUS, 1);
  await set(MUSIC.VOLUME, 140);
  await set(MUSIC.POSITION, 61.6);

  assert.equal(app.calls('POST', '/api/v1/pause').length, 3, 'pause, stop -> pause, pause');
  assert.equal(app.calls('POST', '/api/v1/play').length, 2);
  assert.equal(app.calls('POST', '/api/v1/next').length, 1);
  assert.equal(app.calls('POST', '/api/v1/previous').length, 1);
  assert.deepEqual(app.calls('POST', '/api/v1/volume')[0].body, { volume: 100 });
  assert.deepEqual(app.calls('POST', '/api/v1/seek-to')[0].body, { seconds: 62 });
  hub.stop();
});

test('toggles are pressed only when the state differs', async () => {
  const { app, hub } = await setupHub();
  const [player] = hub.list();
  const set = (type, value) => setPlayerValue(player, { type }, value);

  await set(MUSIC.MUTE, 0); // already unmuted
  await set(MUSIC.MUTE, 1);
  await set(MUSIC.SHUFFLE, 0); // already off
  await set(MUSIC.SHUFFLE, 1);
  assert.equal(app.calls('POST', '/api/v1/toggle-mute').length, 1);
  assert.equal(app.calls('POST', '/api/v1/shuffle').length, 1);
  hub.stop();
});

test('repeat presses the button the right number of times', async () => {
  const { app, hub } = await setupHub();
  const [player] = hub.list();
  // NONE -> ONE: two presses (NONE -> ALL -> ONE).
  await setPlayerValue(player, { type: MUSIC.REPEAT }, 2);
  app.push({ type: 'REPEAT_CHANGED', repeat: 'ONE' });
  await settle();
  // ONE -> ALL: two presses (ONE -> NONE -> ALL).
  await setPlayerValue(player, { type: MUSIC.REPEAT }, 1);
  app.push({ type: 'REPEAT_CHANGED', repeat: 'ALL' });
  await settle();
  // ALL -> ALL: nothing.
  await setPlayerValue(player, { type: MUSIC.REPEAT }, 1);
  assert.deepEqual(
    app.calls('POST', '/api/v1/switch-repeat').map((call) => call.body.iteration),
    [2, 2],
  );
  hub.stop();
});

test('a read-only feature cannot be set', async () => {
  const { hub } = await setupHub({ start: false });
  const [player] = hub.list();
  await assert.rejects(setPlayerValue(player, { type: MUSIC.TITLE }, 1), /cannot be changed/);
});
