// A hub wired to a fake Gladys (SDK) and a fake YouTube Music app.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { Hub } from '../../src/hub.js';
import { normalizeConfig } from '../../src/config.js';
import { createMemoryTokenStore } from '../../src/ytmusic/tokens.js';
import { FakeYtmApp, flush, manualTimers } from './fakeYtm.js';

export async function setupHub({
  players = 'Salon=192.168.1.20',
  app: appOptions,
  start = true,
} = {}) {
  const gladys = createFakeGladys({ selector: 'youtube-music' });
  const app = new FakeYtmApp(appOptions);
  const timers = manualTimers();
  let changes = 0;
  const hub = new Hub(gladys, {
    tokens: createMemoryTokenStore(),
    fetch: app.fetch,
    WebSocket: app.WebSocket,
    timers,
    onChange: () => {
      changes += 1;
    },
  });
  const config = normalizeConfig({ players });
  hub.configure(config);
  if (start) {
    hub.start();
    for (let i = 0; i < 4; i += 1) {
      await flush();
    }
  }
  return { gladys, app, hub, timers, config, changes: () => changes };
}

export async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await flush();
  }
}
