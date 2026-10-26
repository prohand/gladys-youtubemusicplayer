// -----------------------------------------------------------------------------
// Entry point of the YouTube Music Player integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the hub (src/hub.js), which follows the
// YouTube Music apps of the configuration. It holds NO player logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the handlers BEFORE connect();
//   3. connects, publishes the players and starts following them.
//
// Environment variables provided by the Gladys supervisor to the container:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { applyLogLevel } from './src/logging.js';
import { Hub } from './src/hub.js';
import { createActions } from './src/actions.js';
import { createMusicHandlers } from './src/music.js';
import { setPlayerValue } from './src/devices/player.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './src/capabilities/widget.js';
import { createFileTokenStore } from './src/ytmusic/tokens.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
const hub = new Hub(gladys, {
  tokens: createFileTokenStore(),
  onChange: () => refreshWidgets(gladys),
});

/** Apply a configuration: log level, players, devices, badges, status. */
async function applyConfig(rawConfig) {
  config = normalizeConfig(rawConfig);
  applyLogLevel(config);
  hub.configure(config);
  await gladys.publishDiscoveredDevices(hub.buildDevices());
  await hub.publishTransports();
  await hub.publishConnectionStatus();
  refreshWidgets(gladys);
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the players');
  await gladys.publishDiscoveredDevices(hub.buildDevices());
});

// --- A player device created or updated: fill it with the known state -------
gladys.onDeviceCreated(async (device) => hub.republish(device.external_id));
gladys.onDeviceUpdated(async (device) => hub.republish(device.external_id));

// --- Command: the user acts on a feature of a player -------------------------
gladys.onSetValue(async (device, feature, value) => {
  const player = hub.findByExternalId(device.external_id);
  if (!player) {
    // Throw: the SDK sends a success:false acknowledgement to Gladys.
    throw new Error(`Unknown player ${device.external_id}`);
  }
  await setPlayerValue(player, feature, value);
});

// --- Music catalog: search, browse, queue, play (Gladys 5.3+) ---------------
const music = createMusicHandlers(gladys, hub);
gladys.onMusicBrowse((device, options) => music.browse(device, options));
gladys.onMusicSearch((device, options) => music.search(device, options));
gladys.onMusicPlay((device, media, mode) => music.play(device, media, mode));
gladys.onMusicQueueGet((device, options) => music.queueGet(device, options));
gladys.onMusicQueuePlay((device, index) => music.queuePlay(device, index));
// No onMusicGetArtwork: the artwork URLs are already small (see
// artworkUrl in src/ytmusic/parse.js), the SDK's default handler serves them.

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [key, handler] of Object.entries(createActions(hub))) {
  gladys.onAction(key, (fields) => handler(fields));
}

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// Scene TRIGGERS need no handler: the hub fires them (publishSceneEvent).
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(hub, { fields, config }));
}

// --- Dashboard widget (Gladys 5.1+) -------------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, hub }));
  gladys.onWidgetAction(key, (actionKey, params, { settings, values }) =>
    widget.action(gladys, { hub, actionKey, params, settings, values }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  try {
    await applyConfig(newConfig);
  } catch (err) {
    logger.error('Configuration update failed', err);
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    await applyConfig(await gladys.getConfig());
    hub.start();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Logs der Integration.',
        es: 'La inicialización falló, revise los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  hub.stop();
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  hub.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the YouTube Music Player integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
