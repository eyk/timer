# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Types of Changes:

- `Added` for new features.
- `Changed` for changes in existing functionality.
- `Deprecated` for soon-to-be removed features.
- `Removed` for now removed features.
- `Fixed` for any bug fixes.
- `Security` in case of vulnerabilities.

## [Unreleased]

## [1.0.2] - 2026-11-06

- `Changed` the website branding and hourglass, shortened the README, and added a specification and architecture guide.
- `Changed` the Store listing copy and screenshots in English and German.

## [1.0.1] - 2026-11-05

- `Changed` the app window title to Timer while keeping Eyk Timer as the installed product name.
- `Added` automatic light/dark appearance following Windows, including native titlebar updates, without an app theme switch.
- `Changed` the product website to a compact layout with automatic light/dark appearance and German for German browser languages, English otherwise.

## [1.0.0] - 2026-11-05

- `Fixed` recoverable audio/tray/window failures stopping all timers; added native alarm-window fallback and unified the brief acknowledgement guard for keys, clicks and close.

- `Added` Windows release version 1.0.0: keyboard-first timer, independent countdowns, native window controls, global shortcut, hourglass and audible/visible alarms.
- `Added` German/English language selection, product website and public GitHub distribution as Eyk Timer.
- `Added` automated UI, native-engine and desktop checks, Windows packaging, Store assets and gated update workflows.

- `Fixed` alarm/audio/window races, close acknowledgement and inherited keyboard input during alarm activation.
- `Fixed` premature alarm acknowledgement through closing the previous view and stale window-presentation callbacks consuming the new alarm’s input guard.
- `Fixed` countdowns after calendar-clock corrections using suspend-aware elapsed time and backend remaining-time snapshots.
- `Changed` idle scheduling, measured window layout, production capability isolation and development-only IPC mocks.
- `Changed` the global shortcut to Ctrl+Shift+F11 (fallback Ctrl+Shift+F10) to avoid AltGr text-entry conflicts.

<!-- Record future changes under Unreleased; move them into a dated version section when released. -->

[Unreleased]: https://github.com/eyk/timer/compare/v1.0.2...HEAD
[1.0.0]: https://github.com/eyk/timer/releases/tag/v1.0.0

[1.0.1]: https://github.com/eyk/timer/releases/tag/v1.0.1
[1.0.2]: https://github.com/eyk/timer/releases/tag/v1.0.2
