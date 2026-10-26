import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../src/actions.js';
import { LANGUAGES } from '../src/i18n.js';
import { normalizeConfig } from '../src/config.js';
import { setupHub } from './helpers/setup.js';

test('test_connection reports every player in every language', async () => {
  const { app, hub } = await setupHub({ players: 'Salon=192.168.1.20, bad host!', start: false });
  const actions = createActions(hub);
  let report = await actions.test_connection();
  assert.deepEqual(Object.keys(report), LANGUAGES);
  assert.match(report.en, /Salon: OK, playing "Get Lucky — Daft Punk"/);
  assert.match(report.fr, /Ignoré/);

  app.song = null;
  report = await actions.test_connection();
  assert.match(report.de, /nichts geladen/);

  app.reachable = false;
  report = await actions.test_connection();
  assert.match(report.es, /sin respuesta en 192\.168\.1\.20:26538/);
});

test('test_connection explains a refused access and an empty list', async () => {
  const { hub } = await setupHub({ app: { auth: 'deny' }, start: false });
  const actions = createActions(hub);
  assert.match((await actions.test_connection()).en, /access denied/);
  hub.configure(normalizeConfig({ players: '' }));
  assert.match((await actions.test_connection()).en, /No player configured/);
});

test('authorize asks for a new token', async () => {
  const { app, hub } = await setupHub();
  const actions = createActions(hub);
  const before = app.authRequests;
  const message = await actions.authorize({
    device: 'ext:youtube-music:player:192-168-1-20-26538',
  });
  assert.equal(message.en, 'Salon authorized.');
  assert.equal(app.authRequests, before + 1);
  hub.stop();
});

test('authorize says when Deny was clicked', async () => {
  const { hub } = await setupHub({ app: { auth: 'deny' }, start: false });
  const message = await createActions(hub).authorize({
    device: 'ext:youtube-music:player:192-168-1-20-26538',
  });
  assert.match(message.en, /Access denied/);
  await assert.rejects(createActions(hub).authorize({ device: 'nope' }), /Unknown player/);
});
