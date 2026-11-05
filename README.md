# Eyk Timer

Type minutes. Press Enter. Done.

A small Windows timer with a global shortcut, up to ten independent countdowns,
and an audible and visual alarm. While timers run, an hourglass in the notification
area shows the next countdown on hover; click it to reopen the app.

- **Ctrl+Shift+F11** opens an empty, focused input. Type **1–999** minutes and press **Enter**.
- **Enter**, **Escape**, or the window’s **×** acknowledges an alarm. Each countdown has its own cancel button.
- **Escape** or the window's **×** hides it; **Ctrl+Q** quits and stops all timers.

The shortcut works while the app is running; a fallback is shown if needed.
Timers are kept in memory and do not survive quitting or restarting Windows.

## Development

Tauri 2 · React · TypeScript · Rust. Requires Node.js 22+, Edge for UI tests,
and the [Windows Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run desktop       # Native app with hot reload
npm run build         # Frontend checks and build
npm test              # UI interaction checks
npm run native:test   # Timer engine checks
npm run installer     # Local Windows installer
```

Installers are written to `src-tauri/target/release/bundle/nsis/`.
[Download for Windows](https://github.com/eyk/timer/releases/latest) · [Website](https://eyk.github.io/timer/)

The direct installer is unsigned; Windows may show a security prompt.
The app follows Windows light/dark appearance automatically, without a theme switch.
The app follows your preferred Windows language (German or English, with English fallback).
See [Windows release](store/README.md) for MSIX packaging, tests and Store assets.

[MIT](LICENSE) · Walter Seethaler
