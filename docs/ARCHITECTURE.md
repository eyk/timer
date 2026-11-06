# [Home](../README.md) › Architecture

The [specification](SPEC.md) defines observable timer behavior. This page maps that behavior to the current Windows implementation and defines where future platform integrations belong.

| Component | Responsibility |
| --- | --- |
| [Timer state](../src-tauri/src/timer.rs) | Owns timers, deadlines, expiry, cancellation and acknowledgement. It takes elapsed time as input and is independent of the window and operating system. |
| [Controller](../src-tauri/src/controller.rs) and [runtime](../src-tauri/src/lib.rs) | Coordinate timer state, alarm presentation and input. The Windows runtime keeps running with the window hidden and sends state snapshots with remaining time to the view. |
| [Platform integration](../src-tauri/src/platform.rs) | Supplies window and sound behavior. [Clock](../src-tauri/src/clock.rs) provides elapsed time and [language](../src-tauri/src/language.rs) reads system preferences. The runtime connects the system shortcut and tray. |
| [Tauri boundary](../src/backend.ts) and [view](../src/App.tsx) | Send user actions to the runtime and render countdowns from its snapshots. The view owns input, layout and accessibility. |

## Platform boundary

Windows is the implemented target. A port should reuse the timer rules and view where practical and adapt elapsed time, background scheduling, alarms, activation and packaging at the system boundary. A mobile implementation can delegate scheduling and delivery to the operating system. No shared platform interface is needed until a second implementation makes that boundary concrete.

## Verification and distribution

Rust tests check timer state and timing behavior. [Browser tests](../tests/timer.spec.ts) check interaction and layout. [Native desktop checks](../scripts/test-desktop.mjs) exercise the window and background timer in a build with an isolated test identity. Each supported platform needs an installed-app check for its own activation and alarm behavior. The [Windows release guide](../store/README.md) describes packaging and CI. Microsoft Store manages updates to the Store MSIX. The GitHub installer is distributed separately.
