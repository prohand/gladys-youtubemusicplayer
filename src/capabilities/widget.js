// -----------------------------------------------------------------------------
// Dashboard widget "YouTube Music" (manifest `widgets`, Gladys 5.1+).
//
// A compact remote for one player: what plays, the live volume, the state of
// the link, and four buttons — previous, play/pause, next, and a small form to
// play a song by its name. The content is declarative: the core renders it
// with its own theme, dark mode and translations.
//
// The volume tile and the previous / next buttons are bound to device
// features (live, nothing to refresh). The title, the state and the link are
// computed here: the hub asks the core to re-pull the widget when they change
// (track, play/pause, online/offline), the TTL being only a safety net.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_TYPES,
  MUSIC_PLAY_MODES,
  WIDGET_COLORS,
} from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { playerIds } from '../devices/player.js';
import { playSearch } from '../music.js';
import { LINK_MODES } from '../ytmusic/player.js';

const logger = createLogger({ name: 'widget' });

/** Widget key, as declared in the manifest `widgets` field. */
export const NOW_PLAYING_WIDGET = 'now_playing';

/** Keys of the `button` actions of the content. */
export const WIDGET_ACTIONS = {
  TOGGLE_PLAY: 'toggle_play',
  PLAY_SEARCH: 'play_search',
};

const MUSIC = DEVICE_FEATURE_TYPES.MUSIC;

/** Shorten a text to the bound the core applies, without a cut word end. */
export function truncate(text, max) {
  const value = String(text ?? '').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

const text = (texts) => localize((language) => pick(language, texts));

const STATE_LABELS = {
  playing: { en: 'Playing', fr: 'Lecture', de: 'Wiedergabe', es: 'Reproduciendo' },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  idle: { en: 'Nothing loaded', fr: 'Rien en cours', de: 'Nichts geladen', es: 'Nada cargado' },
};

const LINK_LABELS = {
  [LINK_MODES.LIVE]: {
    value: { en: 'Live', fr: 'En direct', de: 'Live', es: 'En directo' },
    color: WIDGET_COLORS.SUCCESS,
  },
  [LINK_MODES.POLLING]: {
    value: { en: 'Every 5 s', fr: 'Toutes les 5 s', de: 'Alle 5 s', es: 'Cada 5 s' },
    color: WIDGET_COLORS.WARNING,
  },
  [LINK_MODES.OFFLINE]: {
    value: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
    color: WIDGET_COLORS.DANGER,
  },
};

function playbackRow(player) {
  if (!player.online || !player.song) {
    return { value: text(STATE_LABELS.idle), color: WIDGET_COLORS.NEUTRAL };
  }
  return player.isPlaying
    ? { value: text(STATE_LABELS.playing), color: WIDGET_COLORS.SUCCESS }
    : { value: text(STATE_LABELS.paused), color: WIDGET_COLORS.INFO };
}

function content(gladys, player) {
  const ids = playerIds(gladys, player.id);
  const song = player.song;
  const caption = [song?.artist, song?.album].filter(Boolean).join(' · ');
  const params = { device: ids.device };

  return {
    // Track, play/pause and link changes nudge the widget (see the hub):
    // the TTL only catches a missed nudge.
    ttl_seconds: 60,
    components: [
      {
        type: 'text',
        variant: 'heading',
        text: song?.title
          ? truncate(song.title, 40)
          : text({
              en: 'Nothing playing',
              fr: 'Aucune lecture',
              de: 'Keine Wiedergabe',
              es: 'Nada en reproducción',
            }),
      },
      ...(caption ? [{ type: 'text', variant: 'caption', text: truncate(caption, 80) }] : []),
      {
        type: 'value',
        label: text({ en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' }),
        icon: 'volume-2',
        device_feature: ids.feature(MUSIC.VOLUME),
      },
      {
        type: 'status',
        items: [
          {
            label: text({ en: 'Player', fr: 'Lecteur', de: 'Player', es: 'Reproductor' }),
            icon: 'music',
            value: truncate(player.name, 40),
            color: WIDGET_COLORS.NEUTRAL,
          },
          {
            label: text({ en: 'State', fr: 'État', de: 'Status', es: 'Estado' }),
            icon: 'play-circle',
            ...playbackRow(player),
          },
          {
            label: text({ en: 'Link', fr: 'Liaison', de: 'Verbindung', es: 'Enlace' }),
            icon: 'wifi',
            value: text(LINK_LABELS[player.mode].value),
            color: LINK_LABELS[player.mode].color,
          },
        ],
      },
      {
        type: 'button',
        label: text({ en: 'Previous', fr: 'Précédent', de: 'Zurück', es: 'Anterior' }),
        icon: 'skip-back',
        style: 'secondary',
        device_feature: ids.feature(MUSIC.PREVIOUS),
        value: 1,
      },
      {
        type: 'button',
        label: text({
          en: 'Play / Pause',
          fr: 'Lecture / Pause',
          de: 'Play / Pause',
          es: 'Reproducir / Pausa',
        }),
        icon: player.isPlaying ? 'pause' : 'play',
        style: 'primary',
        action: { key: WIDGET_ACTIONS.TOGGLE_PLAY, params },
      },
      {
        type: 'button',
        label: text({ en: 'Next', fr: 'Suivant', de: 'Weiter', es: 'Siguiente' }),
        icon: 'skip-forward',
        style: 'secondary',
        device_feature: ids.feature(MUSIC.NEXT),
        value: 1,
      },
      {
        type: 'button',
        label: text({
          en: 'Play a song',
          fr: 'Lancer un titre',
          de: 'Titel abspielen',
          es: 'Poner una canción',
        }),
        icon: 'search',
        style: 'secondary',
        action: {
          key: WIDGET_ACTIONS.PLAY_SEARCH,
          params,
          fields: [
            {
              key: 'query',
              type: 'string',
              label: {
                en: 'Song, artist…',
                fr: 'Titre, artiste…',
                de: 'Titel, Künstler…',
                es: 'Canción, artista…',
              },
              placeholder: {
                en: 'e.g. Daft Punk',
                fr: 'ex. Daft Punk',
                de: 'z. B. Daft Punk',
                es: 'p. ej. Daft Punk',
              },
              required: true,
            },
          ],
        },
      },
    ],
  };
}

export const WIDGETS = {
  [NOW_PLAYING_WIDGET]: {
    async get(gladys, { hub, settings }) {
      logger.debug(`onWidgetGet <- ${NOW_PLAYING_WIDGET}`);
      const player = hub.findOrFirst(settings?.device);
      if (!player) {
        return {
          ttl_seconds: 300,
          components: [
            {
              type: 'text',
              text: text({
                en: 'No player yet: add a YouTube Music app in the integration configuration.',
                fr: "Aucun lecteur : ajoutez une application YouTube Music dans la configuration de l'intégration.",
                de: 'Noch kein Player: Füge in der Konfiguration der Integration eine YouTube-Music-App hinzu.',
                es: 'Aún no hay reproductor: añada una app YouTube Music en la configuración de la integración.',
              }),
            },
          ],
        };
      }
      return content(gladys, player);
    },

    // Resolve a toast (≤ 200 characters). `params` were declared in the
    // content above; `values` are what the user typed in the form.
    async action(gladys, { hub, actionKey, params, values }) {
      logger.info(`onWidgetAction <- ${NOW_PLAYING_WIDGET}.${actionKey}`);
      const player = hub.findByExternalId(params?.device);
      if (!player) {
        throw new Error('This player is no longer configured');
      }
      if (actionKey === WIDGET_ACTIONS.TOGGLE_PLAY) {
        await player.client.togglePlay();
        await player.afterCommand();
        return undefined;
      }
      if (actionKey === WIDGET_ACTIONS.PLAY_SEARCH) {
        const track = await playSearch(player, values?.query, MUSIC_PLAY_MODES.REPLACE);
        if (!track) {
          return text({
            en: 'Nothing found.',
            fr: 'Rien trouvé.',
            de: 'Nichts gefunden.',
            es: 'No se encontró nada.',
          });
        }
        const name = truncate([track.title, track.artist].filter(Boolean).join(' — '), 150);
        return localize((language) =>
          pick(language, {
            en: `Playing: ${name}`,
            fr: `Lecture : ${name}`,
            de: `Wiedergabe: ${name}`,
            es: `Reproduciendo: ${name}`,
          }),
        );
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/**
 * Ask the core to re-pull every widget now (rate-limited core-side to one per
 * 10 s per widget, dropped while disconnected).
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
