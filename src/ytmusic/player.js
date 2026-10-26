// -----------------------------------------------------------------------------
// One YouTube Music player: its live link and its state.
//
// The app pushes its state over a WebSocket (/api/v1/ws, API Server plugin):
// a full PLAYER_INFO on connection, then one message per change (track, play/
// pause, position every second, volume, repeat, shuffle). That is the nominal
// mode: Gladys is updated on events, never on a timer.
//
// Older versions of the app have no WebSocket. The player then falls back to
// reading the REST routes every few seconds ("polling" mode, shown as a
// degraded transport badge), and keeps trying the WebSocket each time.
//
// Events emitted:
//   - 'update'      the state changed (publish the now playing)
//   - 'track'       a different track started  (song)
//   - 'playback'    playing <-> paused           (isPlaying)
//   - 'online'      the app answers again        (mode: 'live' | 'polling')
//   - 'offline'     the app stopped answering    (error)
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createLogger, MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { AccessDeniedError } from './client.js';
import { REPEAT_TO_GLADYS, songToNowPlaying } from './parse.js';

/** How the player is reached right now. */
export const LINK_MODES = {
  OFFLINE: 'offline',
  LIVE: 'live',
  POLLING: 'polling',
};

const POLL_INTERVAL_MS = 5000;
const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60_000;
// A WebSocket that neither opens nor fails within this delay is given up.
const OPEN_TIMEOUT_MS = 5000;

export class Player extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.id platform id (see playerPlatformId)
   * @param {string} options.name
   * @param {import('./client.js').YtmClient} options.client
   * @param {typeof WebSocket | null} [options.WebSocket] null: never try the WebSocket
   * @param {object} [options.timers] `{ setTimeout, clearTimeout }` (tests)
   */
  constructor({ id, name, client, WebSocket = globalThis.WebSocket, timers = globalThis }) {
    super();
    this.id = id;
    this.name = name;
    this.client = client;
    this.WebSocket = WebSocket;
    this.timers = timers;
    this.logger = createLogger({ name: `player:${name}` });

    this.mode = LINK_MODES.OFFLINE;
    this.lastError = null;
    this.socket = null;
    this.timer = null;
    this.retryDelay = RETRY_MIN_MS;
    this.running = false;

    this.song = null;
    this.isPlaying = false;
    this.position = 0;
    this.volume = null;
    this.muted = false;
    this.repeat = 'NONE';
    this.shuffle = false;
  }

  get online() {
    return this.mode !== LINK_MODES.OFFLINE;
  }

  /** Start following the app. */
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.connect();
  }

  /** Stop following the app (disconnection, configuration change, shutdown). */
  stop() {
    this.running = false;
    this.clearTimer();
    this.closeSocket();
  }

  clearTimer() {
    if (this.timer) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  schedule(delay) {
    this.clearTimer();
    if (this.running) {
      this.timer = this.timers.setTimeout(() => {
        this.timer = null;
        this.connect();
      }, delay);
    }
  }

  closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
  }

  /**
   * One connection attempt: the WebSocket first, the REST routes when it
   * cannot open. Never throws.
   */
  async connect() {
    if (!this.running) {
      return;
    }
    try {
      await this.client.ensureToken();
    } catch (err) {
      this.failed(err);
      return;
    }
    if (!this.running) {
      return;
    }
    if (typeof this.WebSocket === 'function' && (await this.openSocket())) {
      return;
    }
    // No WebSocket (older app, or a socket refused): read the state instead.
    try {
      await this.refresh();
      this.setOnline(LINK_MODES.POLLING);
      this.retryDelay = RETRY_MIN_MS;
      this.schedule(POLL_INTERVAL_MS);
    } catch (err) {
      this.failed(err);
    }
  }

  /**
   * A failed attempt: retry later, except after "Deny" in the app — asking
   * again would pop the dialog on the computer every minute. The
   * "Authorize a player" action restarts the player.
   */
  failed(err) {
    this.setOffline(err);
    if (err instanceof AccessDeniedError) {
      this.clearTimer();
      return;
    }
    this.retryLater();
  }

  retryLater() {
    this.schedule(this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
  }

  /**
   * Open the WebSocket. Resolves `true` once it is open (the player is then
   * live until it closes), `false` when it could not open.
   */
  openSocket() {
    return new Promise((resolve) => {
      let opened = false;
      let settled = false;
      let socket;
      const settle = (value) => {
        if (!settled) {
          settled = true;
          this.timers.clearTimeout(openTimer);
          resolve(value);
        }
      };
      const openTimer = this.timers.setTimeout(() => {
        if (!opened) {
          this.logger.debug('WebSocket did not open in time');
          if (this.socket === socket) {
            this.closeSocket();
          }
          settle(false);
        }
      }, OPEN_TIMEOUT_MS);

      try {
        socket = new this.WebSocket(this.client.webSocketUrl());
      } catch (err) {
        this.logger.debug(`WebSocket refused: ${err.message}`);
        settle(false);
        return;
      }
      this.socket = socket;

      socket.addEventListener('open', () => {
        if (this.socket !== socket) {
          return;
        }
        opened = true;
        this.retryDelay = RETRY_MIN_MS;
        this.logger.debug('WebSocket open');
        // PLAYER_INFO follows at once and carries the full state.
        this.setOnline(LINK_MODES.LIVE);
        settle(true);
      });
      socket.addEventListener('message', (event) => {
        if (this.socket === socket) {
          this.handleMessage(event.data);
        }
      });
      socket.addEventListener('close', (event) => {
        if (this.socket !== socket) {
          return;
        }
        this.socket = null;
        if (!opened) {
          settle(false);
          return;
        }
        // 1008: the token was refused, ask for a new one at the next attempt.
        if (event?.code === 1008) {
          this.client.forgetToken();
        }
        this.logger.info(`Live link closed (code ${event?.code ?? '?'})`);
        this.setOffline(new Error('Live link closed'));
        this.schedule(RETRY_MIN_MS);
      });
      socket.addEventListener('error', () => {
        // A 'close' always follows: it is the one handled.
      });
    });
  }

  /** Apply one message of the WebSocket. */
  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      this.logger.debug('Unreadable WebSocket message ignored');
      return;
    }
    switch (message?.type) {
      case 'PLAYER_INFO':
        this.applyState(message);
        break;
      case 'VIDEO_CHANGED':
        this.applyState({ song: message.song, position: message.position ?? 0 });
        break;
      case 'PLAYER_STATE_CHANGED':
        this.applyState({ isPlaying: message.isPlaying, position: message.position });
        break;
      case 'POSITION_CHANGED':
        this.applyState({ position: message.position });
        break;
      case 'VOLUME_CHANGED':
        this.applyState({ volume: message.volume, muted: message.muted });
        break;
      case 'REPEAT_CHANGED':
        this.applyState({ repeat: message.repeat });
        break;
      case 'SHUFFLE_CHANGED':
        this.applyState({ shuffle: message.shuffle });
        break;
      default:
        this.logger.debug(`WebSocket message ${message?.type} ignored`);
    }
  }

  /** Read the full state from the REST routes (polling mode, tests). */
  async refresh() {
    const song = await this.client.getSong();
    const volume = await this.client.getVolume().catch(() => null);
    const repeat = await this.client.getRepeatMode().catch(() => null);
    const shuffle = await this.client.getShuffle().catch(() => null);
    this.applyState({
      song: song ?? null,
      isPlaying: song ? song.isPaused === false : false,
      position: song?.elapsedSeconds ?? 0,
      ...(volume ? { volume: volume.state, muted: volume.isMuted } : {}),
      ...(repeat?.mode ? { repeat: repeat.mode } : {}),
      ...(typeof shuffle?.state === 'boolean' ? { shuffle: shuffle.state } : {}),
    });
  }

  /**
   * Merge a partial state and emit what changed. A key absent from `next`
   * is unchanged; `song: null` means nothing is loaded.
   */
  applyState(next) {
    const previousVideoId = this.song?.videoId ?? null;
    const wasPlaying = this.isPlaying;

    if ('song' in next) {
      this.song = next.song && typeof next.song === 'object' ? next.song : null;
    }
    if (typeof next.isPlaying === 'boolean') {
      this.isPlaying = next.isPlaying;
    }
    if (Number.isFinite(next.position)) {
      this.position = next.position;
    }
    if (Number.isFinite(next.volume)) {
      this.volume = next.volume;
    }
    if (typeof next.muted === 'boolean') {
      this.muted = next.muted;
    }
    if (next.repeat in REPEAT_TO_GLADYS) {
      this.repeat = next.repeat;
    }
    if (typeof next.shuffle === 'boolean') {
      this.shuffle = next.shuffle;
    }
    if (!this.song) {
      this.isPlaying = false;
    }

    const videoId = this.song?.videoId ?? null;
    if (videoId && videoId !== previousVideoId) {
      this.emit('track', this.song);
    }
    if (this.isPlaying !== wasPlaying) {
      this.emit('playback', this.isPlaying);
    }
    this.emit('update');
  }

  setOnline(mode) {
    const wasOffline = !this.online;
    const changed = this.mode !== mode;
    this.mode = mode;
    this.lastError = null;
    if (wasOffline) {
      this.logger.info(`Connected (${mode})`);
      this.emit('online', mode);
    } else if (changed) {
      this.emit('mode', mode);
    }
  }

  setOffline(err) {
    const wasOnline = this.online;
    this.mode = LINK_MODES.OFFLINE;
    this.lastError = err;
    if (wasOnline) {
      this.logger.warn(`Disconnected: ${err?.message ?? 'unknown error'}`);
      this.emit('offline', err);
    } else if (err instanceof AccessDeniedError) {
      this.logger.warn(err.message);
    } else {
      this.logger.debug(`Not reachable: ${err?.message ?? 'unknown error'}`);
    }
  }

  /** The playback state Gladys shows. */
  playbackState() {
    if (!this.online || !this.song) {
      return MUSIC_PLAYBACK_STATE.IDLE;
    }
    return this.isPlaying ? MUSIC_PLAYBACK_STATE.PLAYING : MUSIC_PLAYBACK_STATE.PAUSED;
  }

  /** The full "now playing", in the format of `gladys.publishNowPlaying`. */
  nowPlaying() {
    const values = {
      playback_state: this.playbackState(),
      ...songToNowPlaying(this.song),
      shuffle: this.shuffle,
      repeat: REPEAT_TO_GLADYS[this.repeat],
      mute: this.muted,
    };
    // The live position wins over the one the song carried when it started.
    if (this.song) {
      values.position = Math.max(0, Math.round(this.position));
    }
    if (Number.isFinite(this.volume)) {
      values.volume = Math.max(0, Math.min(100, Math.round(this.volume)));
    }
    return values;
  }

  /**
   * After a command: in polling mode nothing pushes the result, so read it.
   * In live mode the WebSocket brings it.
   */
  async afterCommand() {
    if (this.mode === LINK_MODES.POLLING) {
      await this.refresh().catch((err) => this.logger.debug(`Refresh failed: ${err.message}`));
    }
  }
}
