// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
//   - test_connection: try every player and say, in one line each, whether it
//     answers, whether it accepted the integration, and what it plays;
//   - authorize: ask a player for a new access token. The app shows an
//     "Allow / Deny" dialog on its computer; the answer waits for the click.
//
// The answers are multi-language objects, shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES, localize, pick } from './i18n.js';
import { AccessDeniedError, UnreachableError } from './ytmusic/client.js';

const logger = createLogger({ name: 'actions' });

/** One line of the test report, in every language. */
async function testPlayer(player) {
  const where = `${player.host}:${player.port}`;
  try {
    const song = await player.client.getSong();
    const playing = song?.title ? `${song.title}${song.artist ? ` — ${song.artist}` : ''}` : null;
    return (language) =>
      playing
        ? pick(language, {
            en: `${player.name}: OK, playing "${playing}".`,
            fr: `${player.name} : OK, en cours « ${playing} ».`,
            de: `${player.name}: OK, spielt „${playing}“.`,
            es: `${player.name}: OK, sonando «${playing}».`,
          })
        : pick(language, {
            en: `${player.name}: OK, nothing loaded.`,
            fr: `${player.name} : OK, rien en cours.`,
            de: `${player.name}: OK, nichts geladen.`,
            es: `${player.name}: OK, nada cargado.`,
          });
  } catch (err) {
    logger.info(`Test ${player.name}: ${err.message}`);
    if (err instanceof AccessDeniedError) {
      return (language) =>
        pick(language, {
          en: `${player.name}: access denied in the app. Use "Authorize a player" and click Allow on the computer.`,
          fr: `${player.name} : accès refusé dans l'application. Utilisez « Autoriser un lecteur » et cliquez sur Autoriser sur l'ordinateur.`,
          de: `${player.name}: Zugriff in der App verweigert. Nutze „Player autorisieren“ und klicke am Computer auf Erlauben.`,
          es: `${player.name}: acceso denegado en la app. Use «Autorizar un reproductor» y haga clic en Permitir en el ordenador.`,
        });
    }
    if (err instanceof UnreachableError) {
      return (language) =>
        pick(language, {
          en: `${player.name}: no answer at ${where}. Is the app open, with the API Server plugin on?`,
          fr: `${player.name} : pas de réponse sur ${where}. L'application est-elle ouverte, avec le plugin API Server activé ?`,
          de: `${player.name}: keine Antwort unter ${where}. Ist die App geöffnet und das Plugin API Server aktiv?`,
          es: `${player.name}: sin respuesta en ${where}. ¿Está abierta la app, con el plugin API Server activado?`,
        });
    }
    return (language) =>
      pick(language, {
        en: `${player.name}: error (${err.message}).`,
        fr: `${player.name} : erreur (${err.message}).`,
        de: `${player.name}: Fehler (${err.message}).`,
        es: `${player.name}: error (${err.message}).`,
      });
  }
}

export function createActions(hub) {
  return {
    async test_connection() {
      const players = hub.list();
      const lines = await Promise.all(players.map((player) => testPlayer(player)));
      const errors = hub.configErrors;
      return Object.fromEntries(
        LANGUAGES.map((language) => {
          const parts = lines.map((line) => line(language));
          errors.forEach((error) =>
            parts.push(
              pick(language, {
                en: `Ignored: ${error}`,
                fr: `Ignoré : ${error}`,
                de: `Ignoriert: ${error}`,
                es: `Ignorado: ${error}`,
              }),
            ),
          );
          if (players.length === 0) {
            parts.unshift(
              pick(language, {
                en: 'No player configured yet.',
                fr: 'Aucun lecteur configuré.',
                de: 'Noch kein Player eingerichtet.',
                es: 'Aún no hay reproductor configurado.',
              }),
            );
          }
          return [language, parts.join('\n')];
        }),
      );
    },

    async authorize(fields) {
      const player = hub.findByExternalId(fields.device);
      if (!player) {
        throw new Error('Unknown player');
      }
      player.client.forgetToken();
      try {
        await player.client.authorize();
      } catch (err) {
        if (err instanceof AccessDeniedError) {
          return localize((language) =>
            pick(language, {
              en: 'Access denied: "Deny" was clicked in the app.',
              fr: "Accès refusé : « Refuser » a été cliqué dans l'application.",
              de: 'Zugriff verweigert: In der App wurde „Ablehnen“ geklickt.',
              es: 'Acceso denegado: se hizo clic en «Denegar» en la app.',
            }),
          );
        }
        throw err;
      }
      // Reconnect at once with the new token.
      if (hub.running) {
        player.stop();
        player.start();
      }
      return localize((language) =>
        pick(language, {
          en: `${player.name} authorized.`,
          fr: `${player.name} autorisé.`,
          de: `${player.name} autorisiert.`,
          es: `${player.name} autorizado.`,
        }),
      );
    },
  };
}
