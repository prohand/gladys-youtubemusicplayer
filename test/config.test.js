import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  DEFAULT_PORT,
  normalizeConfig,
  parsePlayerEntry,
  parsePlayers,
  playerPlatformId,
} from '../src/config.js';

test('normalizeConfig fills the defaults and forces the types', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({ players: '  10.0.0.2  ', detailed_logs: 'true' });
  assert.equal(config.players, '10.0.0.2');
  assert.equal(config.detailed_logs, true);
});

test('a bare address uses the default port and a default name', () => {
  assert.deepEqual(parsePlayerEntry('192.168.1.20'), {
    name: 'YouTube Music (192.168.1.20)',
    host: '192.168.1.20',
    port: DEFAULT_PORT,
    id: '192-168-1-20-26538',
  });
});

test('a name, a host name, a port and a pasted URL are understood', () => {
  assert.deepEqual(parsePlayerEntry(' Living room = office.lan:9000 '), {
    name: 'Living room',
    host: 'office.lan',
    port: 9000,
    id: 'office-lan-9000',
  });
  assert.equal(parsePlayerEntry('http://10.0.0.5:26538/').host, '10.0.0.5');
  assert.equal(parsePlayerEntry('[fe80::1]:26538').host, '[fe80::1]');
});

test('invalid entries are reported, not guessed', () => {
  assert.match(parsePlayerEntry('https://10.0.0.5').error, /only http/);
  assert.match(parsePlayerEntry('bad host!').error, /not a valid address/);
  assert.match(parsePlayerEntry('10.0.0.5:70000').error, /port/);
});

test('parsePlayers splits on commas, semicolons and new lines, and drops duplicates', () => {
  const { players, errors } = parsePlayers(
    'Salon=192.168.1.20, Bureau=192.168.1.30;\n192.168.1.20:26538,, oops!',
  );
  assert.deepEqual(
    players.map((player) => player.name),
    ['Salon', 'Bureau'],
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /already listed/);
});

test('the platform id only keeps safe characters', () => {
  assert.equal(playerPlatformId('My-PC.local', 26538), 'my-pc-local-26538');
});
