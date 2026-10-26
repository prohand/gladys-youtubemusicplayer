// -----------------------------------------------------------------------------
// Readers of the YouTube Music payloads relayed by the app.
//
// The queue and the search answers are the raw YouTube Music (InnerTube)
// structures the web player itself uses: deep, undocumented and changing over
// time. Everything here is tolerant: a field that moved gives an empty value,
// an item that cannot be read is skipped, nothing throws.
// -----------------------------------------------------------------------------

import { MUSIC_REPEAT_MODE } from '@gladysassistant/integration-sdk';

/** App repeat mode <-> Gladys MUSIC_REPEAT_MODE (same order: NONE, ALL, ONE). */
export const REPEAT_TO_GLADYS = {
  NONE: MUSIC_REPEAT_MODE.OFF,
  ALL: MUSIC_REPEAT_MODE.ALL,
  ONE: MUSIC_REPEAT_MODE.ONE,
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const DURATION_TEXT = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;

/** A YouTube video id (11 characters), the only thing the app can queue. */
export function isVideoId(value) {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

/**
 * "3:45" or "1:02:03" -> seconds, `null` when the text is not a duration.
 * @param {string} text
 */
export function parseDurationText(text) {
  const match = typeof text === 'string' ? text.trim().match(DURATION_TEXT) : null;
  if (!match) {
    return null;
  }
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * A URL of the artwork small enough for Gladys (≤ 300 KB, the now-playing
 * frame renders under 400 px). Google image URLs carry their size as a
 * suffix (`=w544-h544-l90-rj`); video thumbnails come in fixed sizes.
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function artworkUrl(url) {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
    return null;
  }
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+[^/?#]*$/, '=w400-h400-l90-rj');
  }
  if (/ytimg\.com/.test(url)) {
    return url.replace(/\/(maxresdefault|sddefault)\.jpg/, '/hqdefault.jpg');
  }
  return url;
}

/**
 * The thumbnail closest to 226 px wide (a list thumbnail), from a YouTube
 * `thumbnails` array.
 * @param {Array<{ url: string, width?: number }>} thumbnails
 */
export function pickThumbnail(thumbnails) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
    return null;
  }
  const sorted = thumbnails
    .filter((thumbnail) => typeof thumbnail?.url === 'string')
    .sort((a, b) => Math.abs((a.width ?? 0) - 226) - Math.abs((b.width ?? 0) - 226));
  return sorted.length > 0 ? artworkUrl(sorted[0].url) : null;
}

/** Text of a YouTube `{ runs: [{ text }] }` or `{ simpleText }` object. */
export function textOf(value) {
  if (!value) {
    return '';
  }
  if (typeof value.simpleText === 'string') {
    return value.simpleText;
  }
  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run?.text ?? '').join('');
  }
  return '';
}

/**
 * The "now playing" values of a song of the app (GET /song, WebSocket),
 * in the format of `gladys.publishNowPlaying` (minus the playback state).
 * @param {object | null | undefined} song
 */
export function songToNowPlaying(song) {
  if (!song || typeof song !== 'object') {
    return { title: '', artist: '', album: '', artwork_url: null, duration: 0, position: 0 };
  }
  return {
    title: String(song.title ?? ''),
    artist: String(song.artist ?? ''),
    album: String(song.album ?? ''),
    artwork_url: artworkUrl(song.imageSrc),
    duration: Math.max(0, Math.round(Number(song.songDuration) || 0)),
    position: Math.max(0, Math.round(Number(song.elapsedSeconds) || 0)),
  };
}

/** The renderer of one queue item, wrapped or not. */
function queueRenderer(item) {
  return (
    item?.playlistPanelVideoRenderer ??
    item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer ??
    null
  );
}

/**
 * The queue of the app (GET /queue) as a list of tracks.
 * @param {object | null} queue
 * @returns {{ tracks: Array<object>, currentIndex: number | null }}
 */
export function parseQueue(queue) {
  const tracks = [];
  let currentIndex = null;
  for (const item of Array.isArray(queue?.items) ? queue.items : []) {
    const renderer = queueRenderer(item);
    if (!renderer || !isVideoId(renderer.videoId)) {
      continue;
    }
    if (renderer.selected === true && currentIndex === null) {
      currentIndex = tracks.length;
    }
    tracks.push({
      videoId: renderer.videoId,
      title: textOf(renderer.title) || renderer.videoId,
      artist: textOf(renderer.shortBylineText) || textOf(renderer.longBylineText),
      duration: parseDurationText(textOf(renderer.lengthText)),
      artworkUrl: pickThumbnail(renderer.thumbnail?.thumbnails),
    });
  }
  return { tracks, currentIndex };
}

/** Every value of `key` found anywhere under `node`, depth first. */
function collect(node, key, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, key, found));
  } else if (node && typeof node === 'object') {
    for (const [name, child] of Object.entries(node)) {
      if (name === key) {
        found.push(child);
      } else {
        collect(child, key, found);
      }
    }
  }
  return found;
}

/** Page type of a run linking to an artist, an album... */
function pageTypeOf(run) {
  return (
    run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ?? ''
  );
}

/**
 * Artist, album and duration from the subtitle runs of a search result:
 * "Song • Artist • Album • 3:45", the first word being localized.
 */
function readSubtitle(runs) {
  const artists = [];
  let album = '';
  let duration = null;
  for (const run of Array.isArray(runs) ? runs : []) {
    const pageType = pageTypeOf(run);
    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL') {
      artists.push(run.text);
    } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
      album = run.text;
    } else if (duration === null && parseDurationText(run?.text) !== null) {
      duration = parseDurationText(run.text);
    }
  }
  if (artists.length === 0) {
    // No links (an uploaded video): keep the parts between the bullets,
    // minus the type label and the duration.
    const parts = runs
      .map((run) => run?.text ?? '')
      .join('')
      .split(' • ')
      .map((part) => part.trim())
      .filter((part) => part && parseDurationText(part) === null);
    if (parts.length > 1) {
      artists.push(parts[1]);
    } else if (parts.length === 1) {
      artists.push(parts[0]);
    }
  }
  return { artist: artists.join(', '), album, duration };
}

function readListItem(renderer) {
  const columns = (renderer.flexColumns ?? []).map(
    (column) => column?.musicResponsiveListItemFlexColumnRenderer?.text,
  );
  const titleRuns = columns[0]?.runs ?? [];
  const videoId =
    renderer.playlistItemData?.videoId ??
    titleRuns.find((run) => run?.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint
      .watchEndpoint.videoId;
  if (!isVideoId(videoId)) {
    return null;
  }
  const subtitle = readSubtitle(columns.slice(1).flatMap((column) => column?.runs ?? []));
  const fixedDuration = parseDurationText(
    textOf(renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text),
  );
  return {
    videoId,
    title: textOf(columns[0]) || videoId,
    artist: subtitle.artist,
    album: subtitle.album,
    duration: subtitle.duration ?? fixedDuration,
    artworkUrl: pickThumbnail(renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
  };
}

function readCardShelf(renderer) {
  const titleRun = renderer.title?.runs?.[0];
  const videoId = titleRun?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!isVideoId(videoId)) {
    return null;
  }
  const subtitle = readSubtitle(renderer.subtitle?.runs ?? []);
  return {
    videoId,
    title: textOf(renderer.title) || videoId,
    artist: subtitle.artist,
    album: subtitle.album,
    duration: subtitle.duration,
    artworkUrl: pickThumbnail(renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
  };
}

/**
 * The playable tracks of a YouTube Music search answer (POST /search), top
 * result first, without duplicates. Albums, artists and playlists are left
 * out: the app can only queue single tracks.
 * @param {object | null} answer
 */
export function parseSearch(answer) {
  const tracks = [];
  const seen = new Set();
  const push = (track) => {
    if (track && !seen.has(track.videoId)) {
      seen.add(track.videoId);
      tracks.push(track);
    }
  };
  collect(answer, 'musicCardShelfRenderer').forEach((renderer) => push(readCardShelf(renderer)));
  collect(answer, 'musicResponsiveListItemRenderer').forEach((renderer) =>
    push(readListItem(renderer)),
  );
  return tracks;
}
