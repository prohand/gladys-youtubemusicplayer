// -----------------------------------------------------------------------------
// A fake YouTube Music desktop app (API Server plugin): a `fetch` and a
// `WebSocket` that answer like the app, without any network.
//
//   const app = new FakeYtmApp();
//   const client = new YtmClient({ ..., fetch: app.fetch });
//   app.push({ type: 'VIDEO_CHANGED', song });  // to every open socket
// -----------------------------------------------------------------------------

export const SONG = {
  title: 'Get Lucky',
  artist: 'Daft Punk',
  album: 'Random Access Memories',
  imageSrc: 'https://lh3.googleusercontent.com/abc=w544-h544-l90-rj',
  isPaused: false,
  songDuration: 369,
  elapsedSeconds: 12,
  videoId: 'h5EofwRzit0',
  views: 1,
  mediaType: 'AUDIO',
};

/** A queue item, as the app returns it. */
export function queueItem(videoId, title, { selected = false, wrapped = false } = {}) {
  const renderer = {
    videoId,
    selected,
    title: { runs: [{ text: title }] },
    shortBylineText: { runs: [{ text: 'Artist' }] },
    lengthText: { runs: [{ text: '3:05' }] },
    thumbnail: {
      thumbnails: [{ url: `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`, width: 640 }],
    },
  };
  return wrapped
    ? {
        playlistPanelVideoWrapperRenderer: {
          primaryRenderer: { playlistPanelVideoRenderer: renderer },
        },
      }
    : { playlistPanelVideoRenderer: renderer };
}

/** A search answer with a top result, a song shelf and an album. */
export function searchAnswer() {
  const artistRun = (text) => ({
    text,
    navigationEndpoint: {
      browseEndpoint: {
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' },
        },
      },
    },
  });
  const albumRun = (text) => ({
    text,
    navigationEndpoint: {
      browseEndpoint: {
        browseEndpointContextSupportedConfigs: {
          browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' },
        },
      },
    },
  });
  const song = (videoId, title) => ({
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId },
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: {
            thumbnails: [
              { url: `https://lh3.googleusercontent.com/${videoId}=w60-h60-l90-rj`, width: 60 },
              { url: `https://lh3.googleusercontent.com/${videoId}=w120-h120-l90-rj`, width: 120 },
            ],
          },
        },
      },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: {
              runs: [
                { text: 'Song' },
                { text: ' • ' },
                artistRun('Daft Punk'),
                { text: ' & ' },
                artistRun('Pharrell Williams'),
                { text: ' • ' },
                albumRun('Random Access Memories'),
                { text: ' • ' },
                { text: '6:09' },
              ],
            },
          },
        },
      ],
    },
  });
  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicCardShelfRenderer: {
                        title: {
                          runs: [
                            {
                              text: 'Get Lucky',
                              navigationEndpoint: { watchEndpoint: { videoId: 'h5EofwRzit0' } },
                            },
                          ],
                        },
                        subtitle: {
                          runs: [{ text: 'Song' }, { text: ' • ' }, artistRun('Daft Punk')],
                        },
                      },
                    },
                    {
                      musicShelfRenderer: {
                        contents: [
                          song('h5EofwRzit0', 'Get Lucky'),
                          song('5NV6Rdv1a3I', 'Get Lucky (Radio Edit)'),
                          {
                            // An album: no video id, cannot be queued.
                            musicResponsiveListItemRenderer: {
                              flexColumns: [
                                {
                                  musicResponsiveListItemFlexColumnRenderer: {
                                    text: { runs: [{ text: 'Random Access Memories' }] },
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
}

const jsonResponse = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });

export class FakeYtmApp {
  constructor({ auth = 'allow', webSocket = true } = {}) {
    // 'allow' | 'deny' | 'none' (no authorization strategy)
    this.auth = auth;
    this.webSocket = webSocket;
    this.reachable = true;
    this.token = 'token-1';
    this.authRequests = 0;
    this.requests = [];
    this.song = { ...SONG };
    this.volume = { state: 40, isMuted: false };
    this.repeat = 'NONE';
    this.shuffle = false;
    this.queue = [
      queueItem('h5EofwRzit0', 'Get Lucky', { selected: true }),
      queueItem('dQw4w9WgXcQ', 'Never'),
    ];
    this.search = searchAnswer();
    this.sockets = new Set();

    this.fetch = this.fetch.bind(this);
    const app = this;
    this.WebSocket = class FakeSocket extends EventTarget {
      constructor(url) {
        super();
        this.url = url;
        this.closed = false;
        queueMicrotask(() => app.openSocket(this));
      }
      close(code = 1000) {
        if (!this.closed) {
          this.closed = true;
          app.sockets.delete(this);
          const event = new Event('close');
          event.code = code;
          this.dispatchEvent(event);
        }
      }
    };
  }

  openSocket(socket) {
    const token = new URL(socket.url).searchParams.get('token');
    if (!this.reachable || !this.webSocket) {
      socket.close(1006);
      return;
    }
    if (this.auth !== 'none' && token !== this.token) {
      // The plugin opens, then closes with 1008.
      socket.dispatchEvent(new Event('open'));
      socket.close(1008);
      return;
    }
    this.sockets.add(socket);
    socket.dispatchEvent(new Event('open'));
    this.send(socket, {
      type: 'PLAYER_INFO',
      song: this.song,
      isPlaying: this.song ? !this.song.isPaused : false,
      muted: this.volume.isMuted,
      position: this.song?.elapsedSeconds ?? 0,
      volume: this.volume.state,
      repeat: this.repeat,
      shuffle: this.shuffle,
    });
  }

  send(socket, message) {
    const event = new Event('message');
    event.data = JSON.stringify(message);
    socket.dispatchEvent(event);
  }

  /** Push a message to every open socket. */
  push(message) {
    this.sockets.forEach((socket) => this.send(socket, message));
  }

  /** The app is closed: sockets drop, requests fail. */
  goAway() {
    this.reachable = false;
    [...this.sockets].forEach((socket) => socket.close(1006));
  }

  /** Requests to a route, e.g. calls('POST', '/api/v1/next'). */
  calls(method, path) {
    return this.requests.filter((request) => request.method === method && request.path === path);
  }

  async fetch(url, init = {}) {
    if (!this.reachable) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, path: pathname, body, headers: init.headers ?? {} });

    if (method === 'POST' && pathname.startsWith('/auth/')) {
      this.authRequests += 1;
      if (this.auth === 'deny') {
        return jsonResponse(403);
      }
      return jsonResponse(200, { accessToken: this.token });
    }
    if (this.auth !== 'none' && init.headers?.Authorization !== `Bearer ${this.token}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    return this.route(method, pathname.replace('/api/v1', ''), body);
  }

  route(method, path, body) {
    const ok = () => jsonResponse(204);
    switch (`${method} ${path}`) {
      case 'GET /song':
        return this.song ? jsonResponse(200, this.song) : ok();
      case 'GET /volume':
        return jsonResponse(200, this.volume);
      case 'GET /repeat-mode':
        return jsonResponse(200, { mode: this.repeat });
      case 'GET /shuffle':
        return jsonResponse(200, { state: this.shuffle });
      case 'GET /queue':
        return jsonResponse(200, { items: this.queue });
      case 'PATCH /queue':
        this.queue = this.queue.map((item, index) => {
          const renderer = item.playlistPanelVideoRenderer;
          return { playlistPanelVideoRenderer: { ...renderer, selected: index === body.index } };
        });
        return ok();
      case 'POST /queue': {
        const current = this.queue.findIndex((item) => item.playlistPanelVideoRenderer.selected);
        const index =
          body.insertPosition === 'INSERT_AFTER_CURRENT_VIDEO' ? current + 1 : this.queue.length;
        this.queue.splice(index, 0, queueItem(body.videoId, `Track ${body.videoId}`));
        return ok();
      }
      case 'POST /search':
        return jsonResponse(200, this.search);
      case 'POST /play':
      case 'POST /pause':
      case 'POST /toggle-play':
      case 'POST /next':
      case 'POST /previous':
      case 'POST /seek-to':
      case 'POST /volume':
      case 'POST /toggle-mute':
      case 'POST /shuffle':
      case 'POST /switch-repeat':
      case 'POST /like':
      case 'POST /dislike':
        return ok();
      default:
        return new Response('Not found', { status: 404 });
    }
  }
}

/** Timers that never fire on their own (tests drive the reconnections). */
export function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    setTimeout(fn, delay) {
      const id = next++;
      pending.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    /** Run every pending timer once. */
    async runAll() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, { fn }] of due) {
        await fn();
      }
    },
  };
}

/** Let pending microtasks and promise chains settle. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
