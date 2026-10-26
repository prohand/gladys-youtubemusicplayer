# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that drives the **YouTube Music desktop app**
([th-ch/youtube-music](https://github.com/th-ch/youtube-music)) through its **API Server** plugin
(REST + WebSocket on port 26538, routes under `/api/v1`). One Gladys music player device per app.
Requires Gladys 5.3+ (manifest `music` and `keywords`). Scene triggers (track changed, playback
changed, player online/offline), scene actions (play a song by name, rate the current track) and
a "YouTube Music" widget. Started from the official
[integration-template-js](https://github.com/GladysAssistant/integration-template-js); workflows
follow [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/player.test.js             # one file
node --test --test-name-pattern "repeat"    # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, the store checks and a Docker build on
pull requests. Releases: **Actions → Release** only (bumps `package.json`, manifest `version` +
`docker_image`, rolls `CHANGELOG.md`, tags, builds, publishes the GitHub Release).

## Architecture

```
index.js                  SDK bootstrap + wiring only (handlers registered before connect())
src/config.js             defaults (mirror the manifest) + the `players` field parser
src/hub.js                the players of the config; player events -> Gladys (now playing,
                          scene events, transport badge, connection status, history)
src/ytmusic/client.js     REST client of the API Server plugin, token flow (POST /auth/{id})
src/ytmusic/player.js     one app: WebSocket live link, REST polling fallback, reconnection
src/ytmusic/parse.js      readers of the song / queue / InnerTube search payloads
src/ytmusic/tokens.js     access tokens kept in /data/tokens.json
src/devices/player.js     discovery payload (music features) + onSetValue
src/music.js              onMusicBrowse / Search / Play / QueueGet / QueuePlay
src/actions.js            Configuration screen buttons (test_connection, authorize)
src/capabilities/         Gladys 5.1 scene actions and the dashboard widget
src/i18n.js, logging.js   { en, fr, de, es } texts; log level from the configuration
docs/{en,fr,de,es}.md     user documentation, re-hosted by Gladys (en and fr mandatory)
test/                     node --test, SDK fake Gladys + test/helpers/fakeYtm.js (fake app)
```

### Invariants worth knowing

- **External ids are forever.** A player is `ext:<selector>:player:<host>-<port>`; its features
  are `<device>:<type>` — the SDK default of `publishNowPlaying`, so the now playing is one call.
  Changing an address creates a new device (documented). Trigger, action, widget and config keys
  are stored by users: never rename them.
- **Publish on events, never on a timer.** The WebSocket pushes the state; `publishNowPlaying`
  diffs it and republishes the position only on a seek. Polling (5 s) is only the fallback for
  apps without the WebSocket, shown as a degraded `local` badge.
- **The app is the source of truth.** Writable features have `has_feedback: true`: a command goes
  to the app and the new state comes back from it. Mute / shuffle are toggles in the app: press
  only when the state differs. Repeat cycles NONE → ALL → ONE (same order as Gladys 0/1/2).
- **Only single tracks can be queued** (`POST /queue` takes a video id): search returns tracks
  only, albums and playlists are not playable. "Play now" inserts after the current track, waits
  for it to appear in the queue (the app adds it asynchronously), then jumps to it.
- **Authorization** waits for a click on the computer (60 s timeout); concurrent callers share
  one request. Tokens live in `/data` (the only writable path) and are **never logged**.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- Tests never touch the network: `FakeYtmApp` provides `fetch` and `WebSocket`; pass
  `WebSocket: null` to a Player to disable it (undefined falls back to the real global).

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with the code: actions,
scene triggers / actions and widget keys vs handlers, `DEFAULT_CONFIG`, the four languages on
every text, description and widget bounds, `gladys_version >=5.3.0` for `music` / `keywords`,
`transports: ["local"]`, version / `docker_image` vs `package.json`.

## Conventions

- Prettier formats, ESLint catches mistakes. Comments explain **why**, in English.
- User-facing text is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in `docs/en.md`,
  `docs/fr.md`, `docs/de.md` and `docs/es.md`, kept in sync.
- **Changelog**: every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading: the
  Release workflow moves the section and it becomes the GitHub Release notes.
- **Versions belong to the Release workflow**: never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand.
