import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import {
  NOW_PLAYING_WIDGET,
  WIDGETS,
  WIDGET_ACTIONS,
  refreshWidgets,
  truncate,
} from '../src/capabilities/widget.js';
import { settle, setupHub } from './helpers/setup.js';

const DEVICE = 'ext:youtube-music:player:192-168-1-20-26538';
const widget = WIDGETS[NOW_PLAYING_WIDGET];

const getContent = (gladys, hub, settings = {}) =>
  widget.get(gladys, { hub, settings, language: 'en', units: 'metric' });

// --- Scene actions -----------------------------------------------------------

test('play_search plays the best match and outputs what it played', async () => {
  const { app, hub } = await setupHub();
  const outputs = await SCENE_ACTIONS.play_search(hub, {
    fields: { device: DEVICE, query: 'get lucky', mode: 'next' },
  });
  assert.deepEqual(outputs, { found: true, title: 'Get Lucky', artist: 'Daft Punk' });
  assert.equal(
    app.calls('POST', '/api/v1/queue')[0].body.insertPosition,
    'INSERT_AFTER_CURRENT_VIDEO',
  );

  app.search = {};
  assert.deepEqual(
    await SCENE_ACTIONS.play_search(hub, { fields: { device: DEVICE, query: 'zzz' } }),
    { found: false, title: '', artist: '' },
  );
  hub.stop();
});

test('rate_track likes or dislikes the current track', async () => {
  const { app, hub } = await setupHub();
  assert.deepEqual(
    await SCENE_ACTIONS.rate_track(hub, { fields: { device: DEVICE, rating: 'like' } }),
    { rated: true, title: 'Get Lucky' },
  );
  await SCENE_ACTIONS.rate_track(hub, { fields: { device: DEVICE, rating: 'dislike' } });
  assert.equal(app.calls('POST', '/api/v1/like').length, 1);
  assert.equal(app.calls('POST', '/api/v1/dislike').length, 1);
  hub.stop();
});

test('rate_track with nothing playing is an output, not a failure', async () => {
  const { app, hub } = await setupHub({ start: false });
  app.song = null;
  assert.deepEqual(
    await SCENE_ACTIONS.rate_track(hub, { fields: { device: DEVICE, rating: 'like' } }),
    { rated: false, title: '' },
  );
});

test('a scene action on an unknown player fails', async () => {
  const { hub } = await setupHub({ start: false });
  await assert.rejects(
    SCENE_ACTIONS.play_search(hub, { fields: { device: 'nope', query: 'x' } }),
    /Unknown player/,
  );
});

// --- Widget ------------------------------------------------------------------

test('the widget content is rendered exactly as sent', async () => {
  const { gladys, hub } = await setupHub();
  assert.deepEqual(validateWidgetContent(await getContent(gladys, hub)), []);
  hub.stop();
});

test('the widget stays valid with long texts, offline, and without player', async () => {
  const { gladys, app, hub } = await setupHub();
  app.push({
    type: 'VIDEO_CHANGED',
    song: {
      title: 'A very long title that goes on and on and on, far beyond forty characters',
      artist: 'An artist with a long name'.repeat(3),
      album: 'An album'.repeat(10),
      videoId: 'dQw4w9WgXcQ',
    },
  });
  await settle();
  assert.deepEqual(validateWidgetContent(await getContent(gladys, hub)), []);
  app.goAway();
  await settle();
  assert.deepEqual(validateWidgetContent(await getContent(gladys, hub)), []);
  hub.stop();

  const empty = await setupHub({ players: '', start: false });
  assert.deepEqual(validateWidgetContent(await getContent(empty.gladys, empty.hub)), []);
});

test('the widget tiles and buttons point at features the players publish', async () => {
  const { gladys, hub } = await setupHub();
  const features = new Set(
    hub.buildDevices().flatMap((device) => device.features.map((feature) => feature.external_id)),
  );
  const content = await getContent(gladys, hub, { device: DEVICE });
  const bound = content.components.filter((component) => component.device_feature);
  assert.ok(bound.length >= 3);
  bound.forEach((component) => assert.ok(features.has(component.device_feature)));
  hub.stop();
});

test('every widget button action is handled', async () => {
  const { gladys, app, hub } = await setupHub();
  const content = await getContent(gladys, hub);
  const actions = content.components.filter((component) => component.action);
  assert.deepEqual(
    actions.map((component) => component.action.key).sort(),
    Object.values(WIDGET_ACTIONS).sort(),
  );

  const run = (actionKey, values) =>
    widget.action(gladys, {
      hub,
      actionKey,
      params: { device: DEVICE },
      settings: {},
      values,
    });
  assert.equal(await run(WIDGET_ACTIONS.TOGGLE_PLAY), undefined);
  assert.equal(app.calls('POST', '/api/v1/toggle-play').length, 1);

  const toast = await run(WIDGET_ACTIONS.PLAY_SEARCH, { query: 'get lucky' });
  assert.equal(toast.en, 'Playing: Get Lucky — Daft Punk');
  assert.ok(toast.fr && toast.de && toast.es);
  app.search = {};
  assert.equal((await run(WIDGET_ACTIONS.PLAY_SEARCH, { query: 'zzz' })).en, 'Nothing found.');

  await assert.rejects(run('unknown'), /Unknown widget action/);
  hub.stop();
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});

test('truncate keeps short texts and marks the cut ones', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('a long sentence', 7), 'a long…');
  assert.equal(truncate(undefined, 5), '');
});
