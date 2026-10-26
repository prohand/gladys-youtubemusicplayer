// -----------------------------------------------------------------------------
// Device type: YOUTUBE MUSIC PLAYER
//
// One Gladys device per YouTube Music app, made of the features of the `music`
// category (SDK v0.16, Gladys 5.3+): the dashboard "now playing" card reads
// them, and a scene can drive them like any other device.
//
// Feature external ids follow the SDK convention `${device}:${type}`, the one
// `gladys.publishNowPlaying` uses by default: the now playing is published in
// one call, without a mapping table.
//
// Every writable feature has `has_feedback: true`: the app is the source of
// truth. A command is sent to the app, and the new state comes back through
// its WebSocket (or the next read in polling mode), never assumed.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  MUSIC_PLAYBACK_STATE,
} from '@gladysassistant/integration-sdk';
import { REPEAT_TO_GLADYS } from '../ytmusic/parse.js';

const logger = createLogger({ name: 'device' });

export const DEVICE_TYPE = 'player';

const MUSIC = DEVICE_FEATURE_TYPES.MUSIC;

// Longest position or duration accepted: a 24-hour mix.
const MAX_SECONDS = 86400;
// Text states are truncated at 200 characters by the core.
const MAX_TEXT = 200;

const FEATURES = [
  { type: MUSIC.PLAYBACK_STATE, name: 'Playback', min: 0, max: 3, writable: true },
  { type: MUSIC.PLAY, name: 'Play', min: 0, max: 1, writable: true },
  { type: MUSIC.PAUSE, name: 'Pause', min: 0, max: 1, writable: true },
  { type: MUSIC.PREVIOUS, name: 'Previous', min: 0, max: 1, writable: true },
  { type: MUSIC.NEXT, name: 'Next', min: 0, max: 1, writable: true },
  {
    type: MUSIC.VOLUME,
    name: 'Volume',
    min: 0,
    max: 100,
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    writable: true,
  },
  { type: MUSIC.MUTE, name: 'Mute', min: 0, max: 1, writable: true },
  { type: MUSIC.SHUFFLE, name: 'Shuffle', min: 0, max: 1, writable: true },
  { type: MUSIC.REPEAT, name: 'Repeat', min: 0, max: 2, writable: true },
  {
    type: MUSIC.POSITION,
    name: 'Position',
    min: 0,
    max: MAX_SECONDS,
    unit: DEVICE_FEATURE_UNITS.SECONDS,
    writable: true,
  },
  {
    type: MUSIC.DURATION,
    name: 'Duration',
    min: 0,
    max: MAX_SECONDS,
    unit: DEVICE_FEATURE_UNITS.SECONDS,
    writable: false,
  },
  { type: MUSIC.TITLE, name: 'Title', min: 0, max: MAX_TEXT, writable: false },
  { type: MUSIC.ARTIST, name: 'Artist', min: 0, max: MAX_TEXT, writable: false },
  { type: MUSIC.ALBUM, name: 'Album', min: 0, max: MAX_TEXT, writable: false },
  { type: MUSIC.ARTWORK, name: 'Artwork', min: 0, max: MAX_TEXT, writable: false },
];

/** External ids of a player device and of its features. */
export function playerIds(gladys, playerId) {
  return gladys.externalIds(DEVICE_TYPE, playerId);
}

/**
 * Discovery payload of one player.
 * @param {object} gladys
 * @param {{ id: string, name: string, host: string, port: number }} player
 */
export function buildPlayerDevice(gladys, player) {
  const ids = playerIds(gladys, player.id);
  return {
    name: player.name,
    external_id: ids.device,
    model: 'YouTube Music desktop app',
    params: [{ name: 'address', value: `${player.host}:${player.port}` }],
    features: FEATURES.map((feature) => ({
      name: feature.name,
      external_id: ids.feature(feature.type),
      category: DEVICE_FEATURE_CATEGORIES.MUSIC,
      type: feature.type,
      min: feature.min,
      max: feature.max,
      ...(feature.unit ? { unit: feature.unit } : {}),
      read_only: !feature.writable,
      has_feedback: feature.writable,
      keep_history: false,
    })),
  };
}

/**
 * Run a command of the user on a player (dashboard, scene, voice).
 * @param {import('../ytmusic/player.js').Player} player
 * @param {{ type: string }} feature
 * @param {number} value
 */
export async function setPlayerValue(player, feature, value) {
  const { client } = player;
  const number = Number(value);
  logger.info(`${player.name}: ${feature.type} = ${value}`);

  switch (feature.type) {
    case MUSIC.PLAYBACK_STATE:
      // 2 (stop) has no equivalent in the app: pause is the closest.
      await (number === MUSIC_PLAYBACK_STATE.PLAYING ? client.play() : client.pause());
      break;
    case MUSIC.PLAY:
      await client.play();
      break;
    case MUSIC.PAUSE:
      await client.pause();
      break;
    case MUSIC.NEXT:
      await client.next();
      break;
    case MUSIC.PREVIOUS:
      await client.previous();
      break;
    case MUSIC.VOLUME:
      await client.setVolume(Math.max(0, Math.min(100, Math.round(number))));
      break;
    case MUSIC.MUTE:
      // The app only toggles: press when the state differs.
      if (Boolean(number) !== player.muted) {
        await client.toggleMute();
      }
      break;
    case MUSIC.SHUFFLE:
      if (Boolean(number) !== player.shuffle) {
        await client.shuffle();
      }
      break;
    case MUSIC.REPEAT: {
      // The repeat button cycles NONE -> ALL -> ONE, the order of the Gladys
      // values: the number of presses is the distance between the two.
      const current = REPEAT_TO_GLADYS[player.repeat] ?? 0;
      const presses = (((Math.round(number) - current) % 3) + 3) % 3;
      if (presses > 0) {
        await client.switchRepeat(presses);
      }
      break;
    }
    case MUSIC.POSITION:
      await client.seekTo(Math.max(0, Math.round(number)));
      break;
    default:
      throw new Error(`Feature ${feature.type} cannot be changed`);
  }
  await player.afterCommand();
}
