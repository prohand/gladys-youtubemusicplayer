import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyLogLevel } from '../src/logging.js';
import { LANGUAGES, localize, pick } from '../src/i18n.js';
import { createFileTokenStore, defaultTokenFile } from '../src/ytmusic/tokens.js';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

test('detailed logs switch the level to debug and back', () => {
  const baseline = process.env.LOG_LEVEL;
  try {
    assert.equal(applyLogLevel({ detailed_logs: true }), 'debug');
    assert.equal(process.env.LOG_LEVEL, 'debug');
    applyLogLevel({ detailed_logs: false });
    assert.equal(process.env.LOG_LEVEL, baseline);
  } finally {
    if (baseline === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = baseline;
    }
  }
});

test('localize builds one text per language, English as the fallback', () => {
  const texts = localize((language) => pick(language, { en: 'Hello', fr: 'Bonjour' }));
  assert.deepEqual(Object.keys(texts), LANGUAGES);
  assert.equal(texts.fr, 'Bonjour');
  assert.equal(texts.de, 'Hello');
});

test('tokens survive a restart, in a private file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ytm-tokens-'));
  try {
    const file = join(dir, 'sub', 'tokens.json');
    const store = createFileTokenStore(file);
    assert.equal(store.get('a:1'), undefined);
    store.set('a:1', 'secret');
    assert.equal(createFileTokenStore(file).get('a:1'), 'secret');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    store.delete('a:1');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unreadable token file starts empty, an unwritable one does not throw', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ytm-tokens-'));
  try {
    // A path under a plain file: neither readable nor writable.
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'not a directory');
    const store = createFileTokenStore(join(blocker, 'tokens.json'));
    assert.equal(store.get('a'), undefined);
    store.set('a', 'b');
    assert.equal(store.get('a'), 'b');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the tokens live in /data unless DATA_DIR says otherwise', () => {
  const previous = process.env.DATA_DIR;
  try {
    delete process.env.DATA_DIR;
    assert.equal(defaultTokenFile(), '/data/tokens.json');
    process.env.DATA_DIR = '/tmp/x';
    assert.equal(defaultTokenFile(), '/tmp/x/tokens.json');
  } finally {
    if (previous === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previous;
    }
  }
});

test('the release moves the Unreleased section under the version', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- A thing.',
    '',
    '[Unreleased]: https://github.com/prohand/gladys-youtubemusicplayer/commits/main',
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.0.0', '2026-10-26');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-26\n\n### Added\n\n- A thing\./,
  );
  assert.match(
    after,
    /\[1\.0\.0\]: https:\/\/github\.com\/prohand\/gladys-youtubemusicplayer\/releases\/tag\/v1\.0\.0/,
  );
  assert.equal(rollChangelog(after, '1.0.0', '2026-10-26'), after, 'idempotent');
});
