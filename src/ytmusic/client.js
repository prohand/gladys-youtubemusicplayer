// -----------------------------------------------------------------------------
// REST client of the "API Server" plugin of the YouTube Music desktop app
// (th-ch/youtube-music, default port 26538, routes under /api/v1).
//
// Authentication: the plugin's default strategy ("authorize at first
// request") shows an Allow/Deny dialog on the computer the first time a client
// id asks for a token (POST /auth/{id}); the request stays open until the user
// answers. With the "no authorization" strategy the same call answers at once.
// Either way the token is then sent as `Authorization: Bearer <token>`.
// The token is a secret: it is never logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'api' });

/** The player could not be reached (app closed, computer asleep, wrong address). */
export class UnreachableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'UnreachableError';
  }
}

/** The user clicked "Deny" in the app, or the token was refused. */
export class AccessDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

/** The app answered with an unexpected HTTP status. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Where `addToQueue` puts a track. */
export const QUEUE_POSITIONS = {
  NEXT: 'INSERT_AFTER_CURRENT_VIDEO',
  END: 'INSERT_AT_END',
};

const DEFAULT_TIMEOUT_MS = 5000;
// The authorization request waits for a click on the computer.
const DEFAULT_AUTH_TIMEOUT_MS = 60_000;

export class YtmClient {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {string} options.clientId id shown in the app's Allow dialog
   * @param {{ get: Function, set: Function, delete: Function }} options.tokens
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeoutMs]
   * @param {number} [options.authTimeoutMs]
   */
  constructor({
    host,
    port,
    clientId,
    tokens,
    fetch = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    authTimeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
  }) {
    this.host = host;
    this.port = port;
    this.clientId = clientId;
    this.tokens = tokens;
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;
    this.authTimeoutMs = authTimeoutMs;
    this.pendingAuthorization = null;
  }

  /** Key of this player in the token store. */
  get key() {
    return `${this.host}:${this.port}`;
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }

  /** URL of the live WebSocket, token included (the plugin reads it there). */
  webSocketUrl() {
    const token = this.tokens.get(this.key);
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `ws://${this.host}:${this.port}/api/v1/ws${query}`;
  }

  hasToken() {
    return Boolean(this.tokens.get(this.key));
  }

  /** Forget the token: the next request asks for a new one. */
  forgetToken() {
    this.tokens.delete(this.key);
  }

  /**
   * Ask the app for a token. Concurrent callers share the same request, so the
   * user never gets two dialogs.
   * @returns {Promise<string>}
   */
  authorize() {
    if (!this.pendingAuthorization) {
      this.pendingAuthorization = this.requestToken().finally(() => {
        this.pendingAuthorization = null;
      });
    }
    return this.pendingAuthorization;
  }

  async requestToken() {
    const response = await this.send(
      'POST',
      `/auth/${encodeURIComponent(this.clientId)}`,
      undefined,
      { timeoutMs: this.authTimeoutMs },
    );
    if (response.status === 403) {
      throw new AccessDeniedError('Access denied in the YouTube Music app');
    }
    if (response.status !== 200) {
      throw new ApiError(response.status, `Authorization failed (HTTP ${response.status})`);
    }
    const body = await response.json().catch(() => ({}));
    if (typeof body.accessToken !== 'string' || !body.accessToken) {
      throw new ApiError(response.status, 'Authorization answer without a token');
    }
    this.tokens.set(this.key, body.accessToken);
    return body.accessToken;
  }

  /** Make sure a token is known, asking for one when needed. */
  async ensureToken() {
    if (!this.hasToken()) {
      await this.authorize();
    }
  }

  /**
   * One HTTP exchange, without any authentication logic.
   * @returns {Promise<Response>}
   */
  async send(method, path, body, { timeoutMs = this.timeoutMs, token } = {}) {
    const headers = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    try {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      logger.debug(`${this.key} ${method} ${path} -> ${response.status}`);
      return response;
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'timeout' : (err.cause?.code ?? err.message);
      logger.debug(`${this.key} ${method} ${path} -> ${reason}`);
      throw new UnreachableError(`${this.key} unreachable (${reason})`, { cause: err });
    }
  }

  /**
   * Call an /api/v1 route. A refused token is forgotten and asked again once.
   * @returns {Promise<any>} the JSON answer, `null` for an empty one (204)
   */
  async request(method, path, body) {
    await this.ensureToken();
    let response = await this.send(method, `/api/v1${path}`, body, {
      token: this.tokens.get(this.key),
    });
    if (response.status === 401) {
      // Token revoked in the app, or its secret changed: ask again.
      this.forgetToken();
      await this.authorize();
      response = await this.send(method, `/api/v1${path}`, body, {
        token: this.tokens.get(this.key),
      });
      if (response.status === 401) {
        throw new AccessDeniedError('The YouTube Music app refused the access token');
      }
    }
    if (response.status === 204) {
      return null;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(response.status, `${method} ${path} failed (HTTP ${response.status})`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // --- Playback --------------------------------------------------------------
  play() {
    return this.request('POST', '/play');
  }
  pause() {
    return this.request('POST', '/pause');
  }
  togglePlay() {
    return this.request('POST', '/toggle-play');
  }
  next() {
    return this.request('POST', '/next');
  }
  previous() {
    return this.request('POST', '/previous');
  }
  seekTo(seconds) {
    return this.request('POST', '/seek-to', { seconds });
  }
  setVolume(volume) {
    return this.request('POST', '/volume', { volume });
  }
  toggleMute() {
    return this.request('POST', '/toggle-mute');
  }
  shuffle() {
    return this.request('POST', '/shuffle');
  }
  /** Press the repeat button `iteration` times (NONE -> ALL -> ONE -> NONE). */
  switchRepeat(iteration) {
    return this.request('POST', '/switch-repeat', { iteration });
  }
  like() {
    return this.request('POST', '/like');
  }
  dislike() {
    return this.request('POST', '/dislike');
  }

  // --- State -----------------------------------------------------------------
  /** The current song, `null` when nothing is loaded. */
  getSong() {
    return this.request('GET', '/song');
  }
  /** `{ state: 0-100, isMuted }` */
  getVolume() {
    return this.request('GET', '/volume');
  }
  /** `{ mode: 'NONE' | 'ALL' | 'ONE' | null }` */
  getRepeatMode() {
    return this.request('GET', '/repeat-mode');
  }
  /** `{ state: boolean | null }` */
  getShuffle() {
    return this.request('GET', '/shuffle');
  }

  // --- Queue and search ------------------------------------------------------
  /** The raw queue of the app (`{ items: [...] }`), `null` when empty. */
  getQueue() {
    return this.request('GET', '/queue');
  }
  setQueueIndex(index) {
    return this.request('PATCH', '/queue', { index });
  }
  addToQueue(videoId, insertPosition = QUEUE_POSITIONS.END) {
    return this.request('POST', '/queue', { videoId, insertPosition });
  }
  /** The raw YouTube Music search answer. */
  search(query) {
    return this.request('POST', '/search', { query });
  }
}
