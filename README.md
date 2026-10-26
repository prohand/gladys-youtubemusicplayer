# YouTube Music Player — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that drives the
**YouTube Music desktop app** ([th-ch/youtube-music](https://github.com/th-ch/youtube-music))
running on a computer of your network, through the app's **API Server** plugin. Built on the
JavaScript SDK [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official [integration template](https://github.com/GladysAssistant/integration-template-js).

- **Transport: local.** The integration only talks to the app on the LAN (port 26538). No cloud
  account, no API key.
- **Gladys 5.3+** (music players, catalog keywords).
- **Languages:** English, French, German, Spanish (configuration, messages, widget, docs).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

## Features

| Surface               | What it does                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Device (one per app)  | `music` features: playback state, play, pause, previous, next, volume, mute, shuffle, repeat, position, duration, title, artist, album, artwork |
| Music card            | Now playing with cover, **search** (tracks), **queue** (jump to a track), **Recently played** folder; play now, next or at the end              |
| Scene triggers        | `track_changed` (title, artist, album, video id), `playback_changed` (playing / paused), `player_connection_changed` (online / offline)         |
| Scene actions         | `play_search` (play a song by its name, outputs found / title / artist), `rate_track` (like / dislike)                                          |
| Dashboard widget      | `now_playing`: title, artist, live volume, state, link, previous / play-pause / next, "Play a song" form                                        |
| Configuration actions | `test_connection` (one line per player), `authorize` (asks the app for a new access token)                                                      |

Live updates come from the app's WebSocket (`/api/v1/ws`): Gladys is updated on events, never on a
timer. Older versions of the app without the WebSocket are read every 5 seconds, shown as a
degraded `local` badge.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + wiring (no player logic)
├─ src/
│  ├─ config.js                      # defaults + `players` field parser
│  ├─ hub.js                         # players of the config -> Gladys (states, events, badges)
│  ├─ music.js                       # search, browse, queue, play
│  ├─ actions.js                     # Configuration screen buttons
│  ├─ i18n.js / logging.js           # { en, fr, de, es } texts, log level
│  ├─ devices/player.js              # discovery payload + commands
│  ├─ capabilities/scenes.js         # scene actions (Gladys 5.1+)
│  ├─ capabilities/widget.js         # dashboard widget (Gladys 5.1+)
│  └─ ytmusic/                       # API Server client, live player, payload readers, tokens
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake Gladys + fake YouTube Music app
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready, /data volume
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability privately
└─ .github/
   ├─ workflows/ci.yml               # format, lint, tests (Node 22 + 24), store checks, Docker build
   ├─ workflows/release.yml          # UI-driven release: bump + changelog + tag + build + store
   ├─ workflows/build.yml            # multi-arch build (tag, manual, or called by release)
   ├─ workflows/github-release.yml   # a GitHub Release for every version tag
   ├─ scripts/changelog-release.mjs  # moves [Unreleased] under the released version
   └─ dependabot.yml                 # npm weekly, Actions and Docker monthly
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="gladys-youtubemusicplayer" \
DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test, no network
npx github:GladysAssistant/integration-store .   # store admission checks
```

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major` (the first release:
   `major`, giving `1.0.0`).
3. The workflow bumps `package.json` and the manifest (`version`, `docker_image`), rolls the
   changelog, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64` image to `ghcr.io`, publishes
   the GitHub Release and runs the store checks.

To appear in the Gladys store, the repository must be public with the
`gladys-assistant-integration` topic, and the `ghcr.io` package public. Turn on **Private
vulnerability reporting** in the repository security settings ([`SECURITY.md`](SECURITY.md) sends
reporters there).

## License

Apache-2.0
