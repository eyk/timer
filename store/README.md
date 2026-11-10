# Windows release

Eyk Timer is available through GitHub and the Microsoft Store. The app follows Windows language preferences (German/English, English fallback). The window title is Timer, and both app and website follow system/browser light/dark appearance without a theme control. The website uses German for a German browser language and English otherwise; navigation lists EN before DE. Each Store listing uses two screenshots, entering minutes and one running timer. Each combines genuine light and dark Windows captures of the same state on a 1920 × 1080 canvas. The website and README use the cropped countdown. Store listings are in `listing.de-DE.json` and `listing.en-US.json`.

Use `assets/300x300.png` as the optional Store tile icon. The other assets are package logos.

## Build and test

```sh
npm ci
npm run release:check
npm run build
npm test
npm run native:test
npm run test:desktop:build
npm run test:desktop
npm run screenshots
npm run installer
npm run package:windows -- -LocalIdentity
```

Run the screenshot command with `TIMER_LANGUAGE=en` for English captures.

Desktop checks use a separate application identity and never stop personal timers. Two staggered real one-minute timers verify the registered global shortcut, native hiding/reopening, cancellation, a deliberately delayed alarm presentation, guarded Enter without a conditional skip, starting another timer during an alarm, and native close acknowledgement. They briefly play the alarm. Inspection APIs are exercised only in the E2E build; unrelated APIs must remain denied. Browser tests additionally cover calendar-clock corrections, idle/hidden render counts, and measured layout at 100–200% font sizes. Rust tests cover effect ordering, a deterministic cross-thread expiry during an old presentation, closing before presentation, aligned scheduler waits, injected audio/worker failures, and production capability isolation. Held Enter/Escape are checked separately in the browser.

The standard shortcut is Ctrl+Shift+F11, with Ctrl+Shift+F10 as fallback. The GitHub installer assigns the key to the Start menu shortcut. Windows can then open the app from a stopped process. The app exits when hidden with no active timers or alarms. The MSIX package registers its shortcut at app launch. Its manifest cannot assign a key to a Start menu shortcut. To provide the same install-time behavior through the Store, use the separate EXE/MSI submission path with a signed standalone installer. The selected combination is shown in the footer.

All alarm acknowledgement, including clicks and native close, is guarded for 750 ms after the alarm actually becomes visible; repeated held Enter events are ignored. Presentation callbacks must match the current opening; closing the previous view cannot acknowledge an alarm before its first presentation. Further expiries during the same alarm do not steal focus again.

The local NSIS smoke test verified installation, executable metadata, Start menu shortcut target and uninstallation. Windows StartApps did not discover either that shortcut or an independent plain-link probe in this session; interactive Windows search still needs checking after installation. No Explorer restart or search-settings change was performed.

Check the installed shortcut on an interactive Windows desktop using a separate test installation. Press it before the app has ever run, with the window visible, and with a countdown running behind the hidden window. Close the idle window, check that the process exits, and use the same shortcut to open it again. Uninstall the test package and verify its Start menu link is removed.

Remaining physical checks: sound audibility on target devices, physical alarm keyboard/focus delivery and Alt+F4, tray clicks, actual suspend/hibernate, Windows accessibility text scaling and Windows 10 compatibility. Suspend elapsed time is simulated in engine tests; the application uses Windows QueryInterruptTime so calendar corrections do not affect durations and suspend time counts. Alarms are app windows/sound, not Windows notification toasts. Native UI keys are primarily sent through CDP; native close is exercised through WM_CLOSE. No test can prove complete usability or absence of defects.

Failure policy: audio, tray, sizing and window-operation failures are logged and retried at bounded intervals; they never stop countdowns or remove alarms. Only an internal engine failure (panic or poisoned state) stops scheduling and requests a restart. A native alarm-window fallback runs if the renderer does not finish its layout handshake; it cannot repair frozen renderer content.

`artifacts/windows/` contains the unsigned MSIX and SHA-256 checksum. The local-validation package deliberately uses a non-Store identity: it is neither a public installer nor ready for Store upload. The separate NSIS installer is under `src-tauri/target/release/bundle/nsis/` and installs WebView2 if needed. The MSIX expects an existing Evergreen WebView2 Runtime (standard on Windows 11); verify this prerequisite when testing on Windows 10. Both package formats include the app's MIT license and generated dependency notices. `licenses/` retains upstream texts omitted from several crate archives; notices are regenerated during native builds and tests.

## First publication

1. Register in [Partner Center](https://storedeveloper.microsoft.com/), reserve an MSIX app name, and copy the package identity **Name**, **Publisher** and **PublisherDisplayName** from Product identity. Keep the chosen display name aligned with the listing and app.
2. Set `MSSTORE_PACKAGE_NAME`, `MSSTORE_PUBLISHER` and `MSSTORE_PUBLISHER_DISPLAY_NAME` as environment variables locally, or repository variables in GitHub Actions. Run `npm run package:windows` without `-LocalIdentity`. Microsoft signs the package after certification; no self-signed certificate is included or installed by these scripts.
3. Use https://eyk.github.io/timer/en/privacy.html (German: /de/privacy.html) as the privacy URL and https://github.com/eyk/timer/issues for support in the Store listing.
4. Test the final Store-identity package with Windows App Certification Kit and on supported Windows versions. Complete the age-rating and availability forms, review `listing.de-DE.json`, and upload the MSIX and screenshots. The first submission is done manually in Partner Center.

The publisher account is verified and Eyk Timer is reserved. The package identity and Store ID are configured in GitHub repository variables; credentials are not tracked. The public repository is https://github.com/eyk/timer; the product website is https://eyk.github.io/timer/.

## Pipelines

Windows jobs use the explicit `windows-2022` image because the current Windows 2025 runner has a reported WebView2 automation regression ([upstream issue](https://github.com/actions/runner-images/issues/14738)). This affects the CI test host, not the supported desktop Windows versions or the app’s Evergreen Runtime requirement. Revisit when upstream is resolved.

- `windows.yml`: automatic frontend, Rust and isolated native desktop checks on Windows.
- `release-windows.yml`: manual, tested NSIS/MSIX artifact preparation. Missing Store identity produces only a clearly named local-validation MSIX. A version tag publishes the verified Windows installer to GitHub Releases. It never submits to Microsoft.
- `store-update.yml`: future updates only, after the first release is live. Requires the `microsoft-store` GitHub environment with a required reviewer, variable `STORE_SUBMISSION_ENABLED=true`, and the explicit input `SUBMIT`. Leave disabled until publication is authorized. Run it from `main` at the reviewed commit.

The update workflow additionally needs repository variable `MSSTORE_APP_ID` and environment secrets `PARTNER_CENTER_TENANT_ID`, `PARTNER_CENTER_SELLER_ID`, `PARTNER_CENTER_CLIENT_ID`, `PARTNER_CENTER_CLIENT_SECRET`. These come from API access linked to Partner Center; never put them in tracked files. Account setup and first publication remain manual; subsequent package builds, tests and update submissions can be automated.

References: [MSIX packaging](https://learn.microsoft.com/en-us/windows/msix/package/manual-packaging-root), [Store screenshots](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images), [Store CLI prerequisites](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/overview).
