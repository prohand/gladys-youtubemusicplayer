# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [0.0.1] - 2026-10-26

### Added

- First version: control the YouTube Music desktop app (th-ch/youtube-music, API Server plugin)
  from Gladys, one music player device per computer, with live updates over its WebSocket and a
  5-second fallback for older versions of the app.
- Music card: now playing with cover, search (tracks), queue, "Recently played" folder; play now,
  next or at the end of the queue.
- Scene triggers: a new track starts, playback starts or pauses, a player goes online or offline.
- Scene actions: play a song by its name, like or dislike the current track.
- "YouTube Music" dashboard widget: now playing, live volume, link state, previous / play-pause /
  next buttons and a "Play a song" form.
- Configuration screen: "Test the players" and "Authorize a player" buttons, detailed logs.
- English, French, German and Spanish texts and documentation.
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-youtubemusicplayer/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/prohand/gladys-youtubemusicplayer/releases/tag/v0.0.1
