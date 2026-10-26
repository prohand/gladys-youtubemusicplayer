import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaItems } from '@gladysassistant/integration-sdk';
import { RECENT_FOLDER, createMusicHandlers, playSearch, playTrack } from '../src/music.js';
import { parseQueue } from '../src/ytmusic/parse.js';
import { setupHub } from './helpers/setup.js';

const DEVICE = { external_id: 'ext:youtube-music:player:192-168-1-20-26538' };

async function setup() {
  const context = await setupHub();
  return { ...context, music: createMusicHandlers(context.gladys, context.hub) };
}

test('search answers valid media items, tracks only', async () => {
  const { music, hub } = await setup();
  const { items } = await music.search(DEVICE, { query: 'get lucky', type: null, limit: 20 });
  assert.equal(items.length, 2);
  assert.deepEqual(validateMediaItems(items), []);
  assert.equal(items[0].id, 'h5EofwRzit0');
  assert.equal(items[0].type, 'track');
  assert.match(items[1].artwork_key, /^art-/);
  assert.deepEqual(await music.search(DEVICE, { query: 'x', type: 'album', limit: 20 }), {
    items: [],
  });
  assert.deepEqual(await music.search(DEVICE, { query: '  ', type: null, limit: 20 }), {
    items: [],
  });
  hub.stop();
});

test('the queue is paged, with the current index of the full queue', async () => {
  const { music, hub } = await setup();
  const page = await music.queueGet(DEVICE, { offset: 1, limit: 10 });
  assert.equal(page.total, 2);
  assert.equal(page.currentIndex, 0);
  assert.deepEqual(
    page.items.map((item) => item.id),
    ['dQw4w9WgXcQ'],
  );
  assert.deepEqual(validateMediaItems(page.items), []);
  hub.stop();
});

test('jumping in the queue selects the track', async () => {
  const { app, music, hub } = await setup();
  await music.queuePlay(DEVICE, 1);
  assert.deepEqual(app.calls('PATCH', '/api/v1/queue')[0].body, { index: 1 });
  hub.stop();
});

test('browse offers the recently played folder', async () => {
  const { music, hub } = await setup();
  const root = await music.browse(DEVICE, { parentId: null, offset: 0, limit: 50 });
  assert.deepEqual(validateMediaItems(root.items), []);
  assert.equal(root.items[0].id, RECENT_FOLDER);
  const recent = await music.browse(DEVICE, { parentId: RECENT_FOLDER, offset: 0, limit: 50 });
  assert.deepEqual(
    recent.items.map((item) => item.id),
    ['h5EofwRzit0'],
  );
  assert.deepEqual(await music.browse(DEVICE, { parentId: 'other', offset: 0, limit: 5 }), {
    items: [],
    total: 0,
  });
  hub.stop();
});

test('play now inserts the track after the current one and jumps to it', async () => {
  const { app, hub } = await setup();
  const [player] = hub.list();
  await playTrack(player, 'aaaaaaaaaaa', 'replace');
  assert.deepEqual(app.calls('POST', '/api/v1/queue')[0].body, {
    videoId: 'aaaaaaaaaaa',
    insertPosition: 'INSERT_AFTER_CURRENT_VIDEO',
  });
  assert.deepEqual(app.calls('PATCH', '/api/v1/queue')[0].body, { index: 1 });
  assert.equal(app.calls('POST', '/api/v1/play').length, 1);
  const { tracks, currentIndex } = parseQueue({ items: app.queue });
  assert.equal(tracks[currentIndex].videoId, 'aaaaaaaaaaa');
  hub.stop();
});

test('next and append only queue the track', async () => {
  const { app, hub } = await setup();
  const [player] = hub.list();
  await playTrack(player, 'bbbbbbbbbbb', 'next');
  await playTrack(player, 'ccccccccccc', 'append');
  assert.deepEqual(
    app.calls('POST', '/api/v1/queue').map((call) => call.body.insertPosition),
    ['INSERT_AFTER_CURRENT_VIDEO', 'INSERT_AT_END'],
  );
  assert.equal(app.calls('PATCH', '/api/v1/queue').length, 0);
  assert.equal(parseQueue({ items: app.queue }).tracks.at(-1).videoId, 'ccccccccccc');
  hub.stop();
});

test('only YouTube tracks can be played', async () => {
  const { hub, music } = await setup();
  await assert.rejects(
    music.play(DEVICE, { id: 'MPREb_album_id', type: 'album' }, 'replace'),
    /Not a YouTube Music track/,
  );
  await assert.rejects(music.play({ external_id: 'unknown' }, { id: 'x' }), /Unknown player/);
  hub.stop();
});

test('playSearch plays the best match, or says nothing matched', async () => {
  const { app, hub } = await setup();
  const [player] = hub.list();
  const track = await playSearch(player, 'get lucky');
  assert.equal(track.videoId, 'h5EofwRzit0');
  app.search = { contents: {} };
  assert.equal(await playSearch(player, 'nothing'), null);
  hub.stop();
});
