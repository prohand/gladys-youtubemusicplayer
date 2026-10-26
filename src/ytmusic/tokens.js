// -----------------------------------------------------------------------------
// Access tokens of the players, kept across restarts.
//
// The API Server plugin of YouTube Music hands out a token the first time a
// client asks for one (POST /auth/{id}), after the user clicked "Allow" on the
// computer running the app. Asking again would pop that dialog again at every
// restart of the integration, so the tokens are written to /data, the only
// writable path of the container.
//
// A token is a secret: it is never logged.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'tokens' });

/** Where the tokens are kept: `$DATA_DIR/tokens.json`, `/data` by default. */
export function defaultTokenFile() {
  return join(process.env.DATA_DIR || '/data', 'tokens.json');
}

/**
 * A token store backed by a JSON file. Reading or writing it never throws: a
 * store that cannot be written only means the user clicks "Allow" again
 * after a restart.
 * @param {string} [file]
 */
export function createFileTokenStore(file = defaultTokenFile()) {
  let tokens = null;

  const load = () => {
    if (tokens === null) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        tokens = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        tokens = {};
      }
    }
    return tokens;
  };

  const save = () => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(tokens), { mode: 0o600 });
    } catch (err) {
      logger.warn(`Cannot save the access tokens (${err.code ?? err.message})`);
    }
  };

  return {
    get(key) {
      return load()[key];
    },
    set(key, token) {
      load()[key] = token;
      save();
    },
    delete(key) {
      if (key in load()) {
        delete tokens[key];
        save();
      }
    },
  };
}

/** An in-memory token store (tests). */
export function createMemoryTokenStore(initial = {}) {
  const tokens = { ...initial };
  return {
    get: (key) => tokens[key],
    set: (key, token) => {
      tokens[key] = token;
    },
    delete: (key) => {
      delete tokens[key];
    },
  };
}
