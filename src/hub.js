// -----------------------------------------------------------------------------
// The players of the configuration, and what they tell Gladys.
//
// The hub owns one Player per configured app. It (re)builds them when the
// configuration changes, and turns their events into Gladys calls:
//   - every state change      -> publishNowPlaying (diffed by the SDK);
//   - a track change          -> `track_changed` scene event + history;
//   - play / pause            -> `playback_changed` scene event;
//   - online / offline        -> `player_connection_changed` scene event,
//                                transport badge, connection status.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { parsePlayers } from './config.js';
import { localize, pick } from './i18n.js';
import { buildPlayerDevice, playerIds } from './devices/player.js';
import { YtmClient } from './ytmusic/client.js';
import { LINK_MODES, Player } from './ytmusic/player.js';
import { artworkUrl } from './ytmusic/parse.js';

const logger = createLogger({ name: 'hub' });

/** Scene trigger keys, as declared in the manifest `scene_triggers`. */
export const SCENE_TRIGGERS = {
  TRACK_CHANGED: 'track_changed',
  PLAYBACK_CHANGED: 'playback_changed',
  CONNECTION_CHANGED: 'player_connection_changed',
};

/** Tracks remembered per player for the "Recently played" folder. */
export const HISTORY_SIZE = 50;

export class Hub {
  /**
   * @param {object} gladys the SDK instance
   * @param {object} options
   * @param {{ get: Function, set: Function, delete: Function }} options.tokens
   * @param {typeof fetch} [options.fetch]
   * @param {typeof WebSocket} [options.WebSocket]
   * @param {object} [options.timers]
   * @param {() => void} [options.onChange] called when a widget should redraw
   */
  constructor(gladys, { tokens, fetch, WebSocket, timers, onChange = () => {} }) {
    this.gladys = gladys;
    this.tokens = tokens;
    this.fetch = fetch;
    this.WebSocket = WebSocket;
    this.timers = timers;
    this.onChange = onChange;
    this.players = new Map();
    this.history = new Map();
    this.configErrors = [];
    this.running = false;
  }

  /** The id each app shows in its "Allow" dialog. */
  get clientId() {
    return `gladys-${this.gladys.selector ?? 'youtube-music'}`;
  }

  /**
   * Build the players of a configuration. Players whose address did not
   * change keep their link (and their state).
   * @param {object} config normalized configuration
   */
  configure(config) {
    const { players, errors } = parsePlayers(config.players);
    this.configErrors = errors;
    errors.forEach((error) => logger.warn(`Configuration: ${error}`));

    const wanted = new Map(players.map((player) => [player.id, player]));
    for (const [id, player] of this.players) {
      if (!wanted.has(id)) {
        player.stop();
        player.removeAllListeners();
        this.players.delete(id);
      }
    }
    for (const entry of players) {
      const existing = this.players.get(entry.id);
      if (existing) {
        existing.name = entry.name;
        continue;
      }
      const player = new Player({
        id: entry.id,
        name: entry.name,
        client: new YtmClient({
          host: entry.host,
          port: entry.port,
          clientId: this.clientId,
          tokens: this.tokens,
          ...(this.fetch ? { fetch: this.fetch } : {}),
        }),
        ...(this.WebSocket !== undefined ? { WebSocket: this.WebSocket } : {}),
        ...(this.timers ? { timers: this.timers } : {}),
      });
      player.host = entry.host;
      player.port = entry.port;
      this.watch(player);
      this.players.set(entry.id, player);
      if (this.running) {
        player.start();
      }
    }
  }

  /** Start following every player (after the connection to Gladys). */
  start() {
    this.running = true;
    this.players.forEach((player) => player.start());
  }

  /** Stop following every player (disconnection, shutdown). */
  stop() {
    this.running = false;
    this.players.forEach((player) => player.stop());
  }

  list() {
    return [...this.players.values()];
  }

  /** The player behind a device external id, `undefined` if none. */
  findByExternalId(externalId) {
    return this.list().find((player) => playerIds(this.gladys, player.id).device === externalId);
  }

  /** The player behind a device external id, or the first one. */
  findOrFirst(externalId) {
    return (externalId && this.findByExternalId(externalId)) || this.list()[0];
  }

  deviceExternalId(player) {
    return playerIds(this.gladys, player.id).device;
  }

  /** The discovery payload: one device per player. */
  buildDevices() {
    return this.list().map((player) =>
      buildPlayerDevice(this.gladys, {
        id: player.id,
        name: player.name,
        host: player.host,
        port: player.port,
      }),
    );
  }

  /**
   * Publish the whole now playing of a player again: the SDK forgets what it
   * published when the user creates or updates the device, and a paused
   * player sends no event that would fill the new device.
   */
  republish(externalId) {
    const player = this.findByExternalId(externalId);
    if (player) {
      player.emit('update');
    }
  }

  /** Recently played tracks of a player, newest first. */
  recentlyPlayed(player) {
    return this.history.get(player.id) ?? [];
  }

  remember(player, song) {
    const list = this.recentlyPlayed(player).filter((track) => track.videoId !== song.videoId);
    list.unshift({
      videoId: song.videoId,
      title: String(song.title ?? song.videoId),
      artist: String(song.artist ?? ''),
      duration: Number.isFinite(song.songDuration) ? Math.round(song.songDuration) : null,
      artworkUrl: artworkUrl(song.imageSrc),
    });
    this.history.set(player.id, list.slice(0, HISTORY_SIZE));
  }

  watch(player) {
    const device = () => this.deviceExternalId(player);

    player.on('update', () => {
      this.gladys
        .publishNowPlaying(device(), player.nowPlaying())
        .catch((err) => logger.debug(`${player.name}: now playing not published (${err.message})`));
    });

    player.on('track', (song) => {
      this.remember(player, song);
      this.fireSceneEvent(SCENE_TRIGGERS.TRACK_CHANGED, {
        device: device(),
        title: String(song.title ?? ''),
        artist: String(song.artist ?? ''),
        album: String(song.album ?? ''),
        video_id: song.videoId,
      });
      this.onChange();
    });

    player.on('playback', (isPlaying) => {
      this.fireSceneEvent(SCENE_TRIGGERS.PLAYBACK_CHANGED, {
        device: device(),
        state: isPlaying ? 'playing' : 'paused',
      });
      this.onChange();
    });

    const connectionChanged = (status) => {
      this.fireSceneEvent(SCENE_TRIGGERS.CONNECTION_CHANGED, { device: device(), status });
      this.publishTransports().catch(() => {});
      this.publishConnectionStatus().catch(() => {});
      this.onChange();
    };
    player.on('online', () => connectionChanged('online'));
    player.on('offline', () => {
      // The app is gone: say so on the dashboard instead of "playing".
      player.emit('update');
      connectionChanged('offline');
    });
    player.on('mode', () => {
      this.publishTransports().catch(() => {});
      this.onChange();
    });
  }

  fireSceneEvent(key, data) {
    this.gladys
      .publishSceneEvent(key, data)
      .catch((err) => logger.debug(`Scene event ${key} not published (${err.message})`));
  }

  /** Transport badge of one player: local, degraded when polling. */
  transportOf(player) {
    if (player.mode === LINK_MODES.OFFLINE) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (player.mode === LINK_MODES.POLLING) {
      return {
        transport: DEVICE_TRANSPORTS.LOCAL,
        degraded: true,
        message: localize((language) =>
          pick(language, {
            en: 'No live updates: update the YouTube Music app',
            fr: "Pas de mise à jour en direct : mettez à jour l'application YouTube Music",
            de: 'Keine Live-Updates: Aktualisiere die YouTube-Music-App',
            es: 'Sin actualizaciones en directo: actualice la app YouTube Music',
          }),
        ),
      };
    }
    return { transport: DEVICE_TRANSPORTS.LOCAL };
  }

  async publishTransports() {
    const entries = this.list().map((player) => ({
      external_id: this.deviceExternalId(player),
      ...this.transportOf(player),
    }));
    // The core takes 100 entries per request.
    for (let index = 0; index < entries.length; index += 100) {
      await this.gladys.publishTransports(entries.slice(index, index + 100));
    }
  }

  /** The connection status of the Configuration screen. */
  connectionStatus() {
    const players = this.list();
    if (this.configErrors.length > 0) {
      return {
        connected: false,
        message: localize((language) =>
          pick(language, {
            en: `Check the player list: ${this.configErrors[0]}`,
            fr: `Vérifiez la liste des lecteurs : ${this.configErrors[0]}`,
            de: `Prüfe die Liste der Player: ${this.configErrors[0]}`,
            es: `Revise la lista de reproductores: ${this.configErrors[0]}`,
          }),
        ),
      };
    }
    if (players.length === 0) {
      return {
        connected: false,
        message: localize((language) =>
          pick(language, {
            en: 'Add the address of a YouTube Music app to start.',
            fr: "Ajoutez l'adresse d'une application YouTube Music pour commencer.",
            de: 'Füge die Adresse einer YouTube-Music-App hinzu, um zu beginnen.',
            es: 'Añada la dirección de una app YouTube Music para empezar.',
          }),
        ),
      };
    }
    const online = players.filter((player) => player.online).length;
    if (online === 0) {
      return {
        connected: false,
        message: localize((language) =>
          pick(language, {
            en: 'No YouTube Music app answers: is it open, with the API Server plugin on?',
            fr: 'Aucune application YouTube Music ne répond : est-elle ouverte, avec le plugin API Server activé ?',
            de: 'Keine YouTube-Music-App antwortet: Ist sie geöffnet und das Plugin API Server aktiv?',
            es: 'Ninguna app YouTube Music responde: ¿está abierta, con el plugin API Server activado?',
          }),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const { connected, message } = this.connectionStatus();
    await this.gladys.setConnectionStatus(connected, message);
  }
}
