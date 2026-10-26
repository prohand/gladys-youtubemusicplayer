import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { HISTORY_SIZE, SCENE_TRIGGERS } from '../src/hub.js';
import { normalizeConfig } from '../src/config.js';
import { SONG } from './helpers/fakeYtm.js';
import { settle, setupHub } from './helpers/setup.js';

const DEVICE = 'ext:youtube-music:player:192-168-1-20-26538';

test('the now playing of a live player reaches Gladys', async () => {
  const { gladys, hub } = await setupHub();
  assert.equal(gladys.fake.lastState(`${DEVICE}:title`), 'Get Lucky');
  assert.equal(gladys.fake.lastState(`${DEVICE}:artist`), 'Daft Punk');
  assert.equal(gladys.fake.lastState(`${DEVICE}:playback_state`), MUSIC_PLAYBACK_STATE.PLAYING);
  assert.equal(gladys.fake.lastState(`${DEVICE}:volume`), 40);
  assert.match(gladys.fake.lastState(`${DEVICE}:artwork`), /^art-[0-9a-f]{12}$/);
  hub.stop();
});

test('a device created in Gladys gets the whole now playing again', async () => {
  const { gladys, hub } = await setupHub();
  const before = gladys.fake.states.length;
  // What the SDK does when the user creates or updates the device.
  gladys.forgetPublishedStates(DEVICE);
  hub.republish(DEVICE);
  await settle();
  const republished = gladys.fake.states
    .slice(before)
    .map((state) => state.device_feature_external_id);
  assert.ok(republished.includes(`${DEVICE}:title`));
  assert.ok(republished.includes(`${DEVICE}:volume`));
  hub.republish('ext:youtube-music:player:unknown');
  hub.stop();
});

test('a track change fires track_changed with its details, and is remembered', async () => {
  const { gladys, app, hub, changes } = await setupHub();
  const before = changes();
  app.push({
    type: 'VIDEO_CHANGED',
    song: { ...SONG, videoId: 'dQw4w9WgXcQ', title: 'Never', artist: 'Rick', album: 'Whenever' },
    position: 0,
  });
  await settle();
  const event = gladys.fake.sceneEvents.at(-1);
  assert.deepEqual(event, {
    key: SCENE_TRIGGERS.TRACK_CHANGED,
    data: {
      device: DEVICE,
      title: 'Never',
      artist: 'Rick',
      album: 'Whenever',
      video_id: 'dQw4w9WgXcQ',
    },
  });
  assert.equal(gladys.fake.lastState(`${DEVICE}:title`), 'Never');
  const [player] = hub.list();
  assert.deepEqual(
    hub.recentlyPlayed(player).map((track) => track.videoId),
    ['dQw4w9WgXcQ', 'h5EofwRzit0'],
  );
  assert.ok(changes() > before, 'the widget is nudged');
  hub.stop();
});

test('play/pause fires playback_changed', async () => {
  const { gladys, app, hub } = await setupHub();
  app.push({ type: 'PLAYER_STATE_CHANGED', isPlaying: false, position: 20 });
  await settle();
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.PLAYBACK_CHANGED,
    data: { device: DEVICE, state: 'paused' },
  });
  assert.equal(gladys.fake.lastState(`${DEVICE}:playback_state`), MUSIC_PLAYBACK_STATE.PAUSED);
  hub.stop();
});

test('online / offline fire player_connection_changed, the badge and the status follow', async () => {
  const { gladys, app, hub, timers } = await setupHub();
  assert.deepEqual(gladys.fake.sceneEvents[0], {
    key: SCENE_TRIGGERS.CONNECTION_CHANGED,
    data: { device: DEVICE, status: 'online' },
  });
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: DEVICE,
    transport: 'local',
  });
  assert.equal(gladys.fake.connectionStatus.connected, true);

  app.goAway();
  await settle();
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.CONNECTION_CHANGED,
    data: { device: DEVICE, status: 'offline' },
  });
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(gladys.fake.lastState(`${DEVICE}:playback_state`), MUSIC_PLAYBACK_STATE.IDLE);

  app.reachable = true;
  await timers.runAll();
  await settle();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  hub.stop();
});

test('a player reached by polling shows a degraded local badge', async () => {
  const { gladys, hub } = await setupHub({ app: { webSocket: false } });
  await settle(8);
  const badge = gladys.fake.transports.at(-1);
  assert.equal(badge.transport, 'local');
  assert.equal(badge.degraded, true);
  assert.ok(badge.message.en && badge.message.fr && badge.message.de && badge.message.es);
  hub.stop();
});

test('reconfiguring keeps the unchanged players and drops the removed ones', async () => {
  const { hub } = await setupHub({ players: 'A=10.0.0.1, B=10.0.0.2' });
  const [first] = hub.list();
  hub.configure(normalizeConfig({ players: 'A bis=10.0.0.1, C=10.0.0.3' }));
  const names = hub.list().map((player) => player.name);
  assert.deepEqual(names, ['A bis', 'C']);
  assert.equal(hub.list()[0], first, 'same player object, same link');
  hub.stop();
});

test('configuration errors and an empty list are explained in the status', async () => {
  const { hub } = await setupHub({ players: '', start: false });
  assert.equal(hub.connectionStatus().connected, false);
  assert.match(hub.connectionStatus().message.en, /Add the address/);
  hub.configure(normalizeConfig({ players: 'bad host!' }));
  assert.match(hub.connectionStatus().message.fr, /Vérifiez la liste/);
});

test('the history keeps the last tracks, newest first', async () => {
  const { hub } = await setupHub({ start: false });
  const [player] = hub.list();
  for (let i = 0; i < HISTORY_SIZE + 5; i += 1) {
    hub.remember(player, { ...SONG, videoId: `vid${String(i).padStart(8, '0')}` });
  }
  hub.remember(player, { ...SONG, videoId: 'vid00000054' });
  const history = hub.recentlyPlayed(player);
  assert.equal(history.length, HISTORY_SIZE);
  assert.equal(history[0].videoId, 'vid00000054');
  assert.equal(history.filter((track) => track.videoId === 'vid00000054').length, 1);
});

test('the hub finds a player by device, or the first one', async () => {
  const { hub } = await setupHub({ players: 'A=10.0.0.1, B=10.0.0.2', start: false });
  assert.equal(hub.findByExternalId('ext:youtube-music:player:10-0-0-2-26538').name, 'B');
  assert.equal(hub.findByExternalId('nope'), undefined);
  assert.equal(hub.findOrFirst(undefined).name, 'A');
  assert.equal(hub.clientId, 'gladys-youtube-music');
});
