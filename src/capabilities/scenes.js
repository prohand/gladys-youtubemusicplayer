// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Scene TRIGGERS go the other way ("this happened") and are fired by the hub
// from the players' events (see src/hub.js, SCENE_TRIGGERS).
//
// The rules that matter:
//   - `fields` arrive resolved (scene variables substituted, validated); a
//     `"source": "devices"` field is the chosen device external id;
//   - the resolved object holds the declared `outputs` only;
//   - a scene action is never a condition: "nothing found" is an output
//     (`found: false`), not a failure; a player that does not answer is one.
// -----------------------------------------------------------------------------

import { createLogger, MUSIC_PLAY_MODES } from '@gladysassistant/integration-sdk';
import { playSearch } from '../music.js';

const logger = createLogger({ name: 'scenes' });

function playerFor(hub, externalId) {
  const player = hub.findByExternalId(externalId);
  if (!player) {
    throw new Error(`Unknown player ${externalId}`);
  }
  return player;
}

export const SCENE_ACTIONS = {
  // "Play the song you find for this text": a morning radio, a party
  // playlist started by a button...
  async play_search(hub, { fields }) {
    const player = playerFor(hub, fields.device);
    const mode = Object.values(MUSIC_PLAY_MODES).includes(fields.mode)
      ? fields.mode
      : MUSIC_PLAY_MODES.REPLACE;
    logger.info(`Scene action play_search <- ${player.name}: "${fields.query}" (${mode})`);
    const track = await playSearch(player, fields.query, mode);
    return {
      found: Boolean(track),
      title: track?.title ?? '',
      artist: track?.artist ?? '',
    };
  },

  // Like or dislike the track playing now, from a scene (a button on the
  // wall, a voice command).
  async rate_track(hub, { fields }) {
    const player = playerFor(hub, fields.device);
    logger.info(`Scene action rate_track <- ${player.name}: ${fields.rating}`);
    if (!player.song) {
      return { rated: false, title: '' };
    }
    await (fields.rating === 'dislike' ? player.client.dislike() : player.client.like());
    return { rated: true, title: String(player.song.title ?? '') };
  },
};
