// -----------------------------------------------------------------------------
// The catalog side of the players (manifest `music`, SDK v0.16, Gladys 5.3+):
// search, browse, queue and play, read on demand by the music box of the
// dashboard and by the `music.play-media` scene action of Gladys.
//
// What the app allows, and therefore what is declared:
//   - search: YouTube Music search, single tracks only — the app can queue a
//     track (a video id), not an album nor a playlist;
//   - browse: one folder, "Recently played", the tracks the integration saw
//     on that player since it started;
//   - queue: the queue of the app, and jumping to one of its tracks;
//   - append: a track can be played now, next, or at the end of the queue.
//
// Every handler answers under the 10 s the core waits for.
// -----------------------------------------------------------------------------

import {
  createLogger,
  MUSIC_MEDIA_TYPES,
  MUSIC_PLAY_MODES,
} from '@gladysassistant/integration-sdk';
import { QUEUE_POSITIONS } from './ytmusic/client.js';
import { isVideoId, parseQueue, parseSearch } from './ytmusic/parse.js';

const logger = createLogger({ name: 'music' });

/** Id of the "Recently played" folder of the browse tree. */
export const RECENT_FOLDER = 'recent';

const MAX_ITEMS = 100;
// The app adds a track to its queue asynchronously (it asks YouTube Music
// first): the queue is read again until the track shows up.
const QUEUE_WAIT_MS = 4000;
const QUEUE_POLL_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A track as a Gladys MediaItem. */
export function toMediaItem(gladys, track) {
  return {
    id: track.videoId,
    type: MUSIC_MEDIA_TYPES.TRACK,
    title: track.title.slice(0, 200),
    ...(track.artist ? { subtitle: track.artist.slice(0, 200) } : {}),
    ...(Number.isFinite(track.duration) ? { duration: track.duration } : {}),
    ...(track.artworkUrl ? { artwork_key: gladys.artworkKey(track.artworkUrl) } : {}),
    browsable: false,
    playable: true,
  };
}

/**
 * Search tracks on a player.
 * @returns {Promise<Array<object>>} tracks, best match first
 */
export async function searchTracks(player, query, limit = 20) {
  const text = String(query ?? '').trim();
  if (!text) {
    return [];
  }
  const answer = await player.client.search(text);
  return parseSearch(answer).slice(0, Math.max(1, Math.min(limit, MAX_ITEMS)));
}

/** Wait until `videoId` is in the queue, and resolve its index (or null). */
async function findInQueue(player, videoId, preferredIndex) {
  const deadline = Date.now() + QUEUE_WAIT_MS;
  for (;;) {
    const { tracks } = parseQueue(await player.client.getQueue());
    const indexes = tracks
      .map((track, index) => (track.videoId === videoId ? index : -1))
      .filter((index) => index !== -1);
    if (indexes.length > 0) {
      // The same track can be queued twice: take the copy just added.
      return indexes.reduce((best, index) =>
        Math.abs(index - preferredIndex) < Math.abs(best - preferredIndex) ? index : best,
      );
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await sleep(QUEUE_POLL_MS);
  }
}

/**
 * Play a track on a player.
 * @param {import('./ytmusic/player.js').Player} player
 * @param {string} videoId
 * @param {'replace' | 'next' | 'append'} mode replace = play now
 */
export async function playTrack(player, videoId, mode = MUSIC_PLAY_MODES.REPLACE) {
  if (!isVideoId(videoId)) {
    throw new Error(`Not a YouTube Music track: ${videoId}`);
  }
  const { client } = player;
  logger.info(`${player.name}: play ${videoId} (${mode})`);

  if (mode === MUSIC_PLAY_MODES.APPEND) {
    await client.addToQueue(videoId, QUEUE_POSITIONS.END);
    return;
  }
  const before = parseQueue(await client.getQueue());
  await client.addToQueue(videoId, QUEUE_POSITIONS.NEXT);
  if (mode === MUSIC_PLAY_MODES.NEXT) {
    return;
  }
  // "Play now": the track was inserted after the current one, jump to it.
  // The rest of the queue is kept, like the "Play" of the app itself.
  const expected = before.currentIndex === null ? 0 : before.currentIndex + 1;
  const index = await findInQueue(player, videoId, expected);
  await client.setQueueIndex(index ?? expected);
  await client.play();
  await player.afterCommand();
}

/**
 * Search and play the best match.
 * @returns {Promise<object | null>} the track played, null when nothing matched
 */
export async function playSearch(player, query, mode = MUSIC_PLAY_MODES.REPLACE) {
  const [track] = await searchTracks(player, query, 1);
  if (!track) {
    return null;
  }
  await playTrack(player, track.videoId, mode);
  return track;
}

/**
 * The music handlers, registered by index.js. Each one receives the hub (the
 * players) and the arguments of the SDK handler.
 */
export function createMusicHandlers(gladys, hub) {
  const playerOf = (device) => {
    const player = hub.findByExternalId(device.external_id);
    if (!player) {
      throw new Error(`Unknown player ${device.external_id}`);
    }
    return player;
  };

  return {
    async browse(device, { parentId, offset = 0, limit = 50 }) {
      const player = playerOf(device);
      if (parentId === null || parentId === undefined) {
        return {
          items: [
            {
              id: RECENT_FOLDER,
              type: MUSIC_MEDIA_TYPES.FOLDER,
              title: 'Recently played',
              browsable: true,
              playable: false,
            },
          ],
          total: 1,
        };
      }
      if (parentId !== RECENT_FOLDER) {
        return { items: [], total: 0 };
      }
      const tracks = hub.recentlyPlayed(player);
      return {
        items: tracks.slice(offset, offset + limit).map((track) => toMediaItem(gladys, track)),
        total: tracks.length,
      };
    },

    async search(device, { query, type, limit = 20 }) {
      // Only tracks can be played: an album, artist or playlist search
      // finds nothing rather than items the app cannot queue.
      if (type && type !== MUSIC_MEDIA_TYPES.TRACK) {
        return { items: [] };
      }
      const tracks = await searchTracks(playerOf(device), query, limit);
      return { items: tracks.map((track) => toMediaItem(gladys, track)) };
    },

    async play(device, media, mode) {
      await playTrack(playerOf(device), media?.id, mode);
    },

    async queueGet(device, { offset = 0, limit = 50 }) {
      const { tracks, currentIndex } = parseQueue(await playerOf(device).client.getQueue());
      return {
        items: tracks.slice(offset, offset + limit).map((track) => toMediaItem(gladys, track)),
        currentIndex,
        total: tracks.length,
      };
    },

    async queuePlay(device, index) {
      const player = playerOf(device);
      await player.client.setQueueIndex(index);
      await player.afterCommand();
    },
  };
}
