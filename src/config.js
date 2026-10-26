// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. This module provides the
// defaults (they MUST match the manifest `default` values, see
// test/manifest.test.js) and turns the `players` text field into a list of
// players.
//
// One player is one YouTube Music desktop app (th-ch/youtube-music) with its
// "API Server" plugin turned on, reached on the LAN at host:port.
// -----------------------------------------------------------------------------

/** Default port of the API Server plugin of the YouTube Music desktop app. */
export const DEFAULT_PORT = 26538;

export const DEFAULT_CONFIG = {
  // Players, separated by commas, semicolons or new lines:
  // `[Name=]host[:port]`, e.g. "Living room=192.168.1.20, office.lan:26538".
  players: '',
  // Raise the log level to debug from the Configuration screen.
  detailed_logs: false,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    players: String(raw.players ?? DEFAULT_CONFIG.players).trim(),
    // Config may arrive as strings from a form.
    detailed_logs: raw.detailed_logs === true || raw.detailed_logs === 'true',
  };
}

// A host name or an IPv4 address, or an IPv6 address between brackets.
const HOST_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62})(?:\.[a-zA-Z0-9-]{1,63})*|\[[0-9a-fA-F:.]+\])$/;

/**
 * Stable platform id of a player, the part of its Gladys external id that
 * names it: built from host and port, the only thing that identifies one app.
 * Changing the address of a player in the configuration therefore creates a
 * new device (see docs).
 * @param {string} host
 * @param {number} port
 */
export function playerPlatformId(host, port) {
  const cleanHost = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${cleanHost}-${port}`;
}

/**
 * Parse one entry of the `players` field.
 * @param {string} entry e.g. "Living room=192.168.1.20:26538"
 * @returns {{ name: string, host: string, port: number, id: string } | { error: string }}
 */
export function parsePlayerEntry(entry) {
  let text = entry.trim();
  let name = '';
  const equal = text.indexOf('=');
  if (equal !== -1) {
    name = text.slice(0, equal).trim();
    text = text.slice(equal + 1).trim();
  }
  // Tolerate a pasted URL: http://host:port/ is the same player.
  text = text.replace(/^http:\/\//i, '').replace(/\/+$/, '');
  if (/^[a-z]+:\/\//i.test(text)) {
    return { error: `"${entry.trim()}": only http:// is supported` };
  }

  let host = text;
  let port = DEFAULT_PORT;
  const portMatch = text.match(/^(.*):(\d+)$/);
  // "fe80::1" alone is an IPv6 address, not a host and a port: an IPv6
  // address with a port is written between brackets.
  if (portMatch && (portMatch[1].startsWith('[') || !portMatch[1].includes(':'))) {
    host = portMatch[1];
    port = Number(portMatch[2]);
  }
  if (!host || !HOST_PATTERN.test(host)) {
    return { error: `"${entry.trim()}": not a valid address` };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: `"${entry.trim()}": the port must be between 1 and 65535` };
  }
  return {
    name: name || `YouTube Music (${host})`,
    host,
    port,
    id: playerPlatformId(host, port),
  };
}

/**
 * Parse the `players` field.
 * @param {string} text
 * @returns {{ players: Array<{ name: string, host: string, port: number, id: string }>, errors: string[] }}
 */
export function parsePlayers(text) {
  const players = [];
  const errors = [];
  for (const entry of String(text ?? '').split(/[,;\n]/)) {
    if (!entry.trim()) {
      continue;
    }
    const parsed = parsePlayerEntry(entry);
    if (parsed.error) {
      errors.push(parsed.error);
    } else if (players.some((player) => player.id === parsed.id)) {
      errors.push(`"${entry.trim()}": this player is already listed`);
    } else {
      players.push(parsed);
    }
  }
  return { players, errors };
}
