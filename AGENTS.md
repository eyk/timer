# Eyk Timer

Maintain a small, reliable timer whose immediate keyboard interaction stays simple.

<project-information>
A Windows desktop timer built with Tauri 2, React, TypeScript, Vite and Rust. The timer engine runs independently of the UI. The app is offline, with no accounts or telemetry. The release version is 1.0.1. German and English follow the Windows language preferences; other platforms are not implemented.
</project-information>

<project-structure>
├── .github/workflows/  # Automated Windows tests, package builds and gated Store updates
├── public/            # Hourglass SVG source used by the app and package icons
├── scripts/           # Local native launcher, desktop checks and Windows packaging
├── src/               # React interface and Tauri command boundary
├── src-tauri/         # Rust timer engine, native Windows integration and app configuration
│   ├── capabilities/  # Webview permissions
│   ├── icons/         # Native app icons
│   ├── resources/     # Alarm sound
│   └── src/           # Timer state, background worker and window/tray integration
├── store/             # Read README.md here before releases; listing, privacy, icons, screenshots
│   ├── assets/        # MSIX package logos generated from the hourglass SVG
│   ├── licenses/      # Original upstream license texts missing from some dependency archives
│   └── screenshots/  # Real native-window Store images; regenerate with npm run screenshots
├── tests/             # Keyboard, layout, language and interaction regression tests
├── website/           # Buildless German/English product website deployed through GitHub Pages
├── AGENTS.md          # Instructions for any agent working in this repository
├── CHANGELOG.md       # Preserve the format/comments; record notable changes under Unreleased
├── LICENSE            # MIT license
└── README.md          # Read before working; keep setup and usage brief

Generated and ignored: node_modules/ (JavaScript dependencies), src-tauri/target/ (Rust builds), dist/ (built UI), artifacts/ (release packages), work/ (temporary test/packaging files), .tooling/ (optional local Rust toolchain), and test-results/ (test diagnostics).
</project-structure>

<agent-instructions>
- Preserve the core flow: open an empty focused input, type 1–999 minutes, press Enter, hide immediately without flashing a new timer card.
- Center entered digits; place the empty caret at the right edge of an imaginary centered digit.
- Stack independent countdowns above the input, using equally large minutes-and-seconds text and an individual cancel button.
- Keep timers running while the window is hidden; make expiry audible and visible, and let Enter acknowledge expired timers without stopping others.
- Keep the grayscale window compact and non-maximizable, with native window controls, the title Timer, a separated version/shortcut status bar and automatic system light/dark appearance without a switch.
- Show the hourglass in the notification area only while timers exist; clicking reopens the app, and the tooltip shows only the next countdown, updated each second.
- Prioritize bug fixes, security and compatibility; additions must preserve the core interaction without setup decisions or extra steps.
- Avoid presets, remembered input, duplicate controls and explanatory interface text.
- Keep changes focused, documentation brief and reusable agent instructions in English.
- Keep the annotated project tree current, listing folders before files and sorting each group alphabetically.
- Publish packages or releases only with explicit maintainer authorization.
</agent-instructions>

<build-and-validation>
Use npm ci to install JavaScript dependencies. Run npm run build and npm test for the UI, npm run native:test for the Rust engine, and npm run release:check for version consistency. Use npm run desktop for local development and npm run installer for an NSIS installer. See store/README.md for MSIX packaging and desktop test commands. Verify native hiding, reopening, background expiry, sound and acknowledgement before claiming desktop validation.
</build-and-validation>
