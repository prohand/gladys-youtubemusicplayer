// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code registers: these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_TRIGGERS } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widget.js';
import { createActions } from '../src/actions.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('../package.json'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// First Gladys release accepting each field (older cores reject unknown fields).
const FIELD_MIN_GLADYS_VERSION = {
  categories: [4, 86, 0],
  widgets: [5, 1, 0],
  scene_triggers: [5, 1, 0],
  scene_actions: [5, 1, 0],
  keywords: [5, 3, 0],
  music: [5, 3, 0],
};

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

// Every multi-language text of the manifest, with its path.
function texts(node, path = '', found = []) {
  if (Array.isArray(node)) {
    node.forEach((child, index) => texts(child, `${path}[${index}]`, found));
  } else if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      if (['label', 'description', 'placeholder'].includes(key)) {
        found.push({ path: `${path}.${key}`, value: child });
      } else {
        texts(child, `${path}.${key}`, found);
      }
    }
  }
  return found;
}

test('version, package.json and docker_image agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-youtubemusicplayer:${pkg.version}`);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const text = manifest.description[language];
    assert.ok(text.length >= 10 && text.length <= 100, `description.${language}: ${text.length}`);
  }
});

test('every text is a multi-language object in en, fr, de and es', () => {
  for (const { path, value } of texts(manifest)) {
    assert.equal(typeof value, 'object', `${path} must be a multi-language object`);
    for (const language of LANGUAGES) {
      assert.ok(value[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('widget labels and descriptions fit the store bounds', () => {
  for (const widget of manifest.widgets) {
    for (const language of LANGUAGES) {
      const label = widget.label[language];
      assert.ok(label.length >= 3 && label.length <= 30, `widget label ${language}`);
      assert.ok(widget.description[language].length <= 100, `widget description ${language}`);
    }
  }
});

test('the manifest declares the transport the integration uses', () => {
  assert.deepEqual(manifest.transports, ['local']);
});

test('each manifest field requires the first Gladys release accepting it', () => {
  for (const [field, version] of Object.entries(FIELD_MIN_GLADYS_VERSION)) {
    if (manifest[field] !== undefined) {
      assert.ok(
        isAtLeast(minGladysVersion(), version),
        `${field} requires gladys_version >= ${version.join('.')}`,
      );
    }
  }
});

test('categories and keywords stay within the store bounds', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const unique = new Set(manifest.keywords.map((keyword) => keyword.trim().toLowerCase()));
  assert.equal(unique.size, manifest.keywords.length, 'keywords must be unique');
  manifest.keywords.forEach((keyword) => assert.ok(keyword.length >= 2 && keyword.length <= 30));
});

test('the music capability declares what the handlers serve', () => {
  assert.deepEqual(manifest.music, { browse: true, search: true, queue: true, append: true });
});

test('every manifest action has a handler, and vice versa', () => {
  const handlers = Object.keys(createActions({}));
  assert.deepEqual(keysOf(manifest.actions).sort(), handlers.sort());
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every scene trigger the hub fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('every widget has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.equal(field.default, undefined);
      assert.ok(!(field.key in DEFAULT_CONFIG), `section ${field.key} stores no value`);
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `${field.key} has a default in DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('section links are https', () => {
  for (const field of manifest.config_schema.filter((f) => f.type === 'section')) {
    for (const link of field.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the user documentation exists in every language (≥ 300 characters)', async () => {
  for (const language of LANGUAGES) {
    const doc = await read(`../docs/${language}.md`);
    assert.ok(doc.length >= 300, `docs/${language}.md is too short`);
  }
});
