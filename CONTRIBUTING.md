# Contributing to Pier

<p>
  <b>English</b> · <a href="CONTRIBUTING.pt-BR.md">Português</a>
</p>

Thanks for helping out with Pier. This guide covers how to build Pier from source, run the tests, and send a pull request.

To report a bug or suggest a feature, [open an issue](https://github.com/pier-dock/pier-dock/issues/new/choose) and pick the matching template.

## Project layout

- `src/`: the React frontend (the dock, the widget panels, and the settings window).
- `src-tauri/`: the Rust backend, built with [Tauri 2](https://tauri.app), with the platform code for Windows, macOS, and Linux.
- `gnome-extension/pier@pier.dev/`: the GNOME Shell extension Pier installs on GNOME.
- `scripts/`: helper scripts to regenerate the icons and prepare a release.

## Development setup

### Prerequisites

- [Node.js](https://nodejs.org) 22 or later
- [Rust](https://rustup.rs) (stable)
- Platform tools:
  - **Windows:** Visual Studio Build Tools with the C++ workload and the Windows SDK. Use the `stable-x86_64-pc-windows-msvc` Rust toolchain.
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux:** `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and `patchelf`.

### Run and build

```sh
npm install
npm run tauri dev     # run in development mode
npm run tauri build   # build the installers into src-tauri/target/release/bundle/
```

When you run `npm run tauri dev` on macOS, the system grants permissions to the terminal that ran the command, not to Pier.

### Preview in the browser

Outside Tauri, `npm run dev` answers IPC calls with sample data so you can review the UI in a browser. Open `http://localhost:1420` with one of these query strings:

- `?view=dock`
- `?view=panel&kind=media` (or `github-mine`, `github-review`, `github-contrib`, `volume`, `network`)
- `?view=settings`

### Tests

```sh
npm test                               # frontend tests
cd src-tauri
cargo test                             # Rust unit tests
cargo test -- --ignored --nocapture    # smoke tests against the real system
```

The smoke tests exercise real windows, apps, media sessions, and the GitHub API on the machine that runs them.

### Widget interaction tests

Run `npx playwright install chromium` once, then `npm run test:ui`. These tests click the real widget UI with fixture IPC responses; they never change the host’s hardware settings. Set `PIER_BROWSER_EXECUTABLE` to use an existing Chromium executable. Native device and OS-settings verification is still required on supported desktops.
### Hover and graphics profiling

Use a release build to judge native performance. In **Settings > Appearance**, **Reduce visual effects** switches to a solid background and removes decorative dock/icon shadows without changing your saved material choice. Compare the same monitor, scale, icon count and widget configuration. Keep the pet and media playback consistent and avoid running builds during a capture.

For a repeatable frontend diagnostic, run `npm run dev` and open `http://localhost:1420/?view=dock&profile=1`. In the browser console:

```js
await pierPerformance.measure({ label: "baseline", durationMs: 5000, sweep: true })
```

The synthetic sweep repeats the same path and includes event-dispatch/hit-testing overhead. For actual pointer input, omit `sweep` and move across the dock manually during the capture. Run each case at least three times after a warmup: (1) glass with normal shadows, (2) solid material with normal shadows, (3) reduced visual effects, and (4) magnification disabled. Change one setting between cases and record the active material from the result: an unsupported glass compositor already uses solid material. To isolate icon shadows during diagnosis, temporarily set `document.querySelector('.dock-bar').style.setProperty('--shadow-icon', 'none')`, then remove that property afterward.

The report includes frame interval median/95th percentile/max, counts over 16.7ms and 33.3ms, icon geometry reads, frontend `set_hit_rect` requests, and long tasks where supported. These interval thresholds are observations, not a refresh-rate-independent count of dropped frames. Discard captures with `hiddenDuringRun`, and record the build, OS/compositor, GPU, refresh rate and active settings with the JSON. `pierPerformance.cancel()` stops a capture. Only one capture runs at a time; instrumentation is restored afterward.

To inspect a native build, paste `scripts/profile-hover.js` into that build's WebView inspector and call the same API. Inspector availability depends on how the build was packaged. The script sends no data and makes no persistent configuration changes. Browser mock results do not measure native blur, IPC processing time or GPU/compositor work: use the platform/WebView profiler alongside the script for those. Compare frame-time traces and native bounds request counts before claiming a performance improvement.

### Icons

All platform icons come from `app-icon.svg` and `src-tauri/icons/source/`. To regenerate them, run `./scripts/icons.sh` on macOS (it requires `iconutil`).

## Pull requests

- Keep each pull request small and focused on one change.
- Title it in the [Conventional Commits](https://www.conventionalcommits.org) style, `type(scope): summary`, for example `feat(dock): …` or `fix(windows): …`. Pull requests are squash-merged, so the title becomes the commit message.
- CI runs `npm run build`, `npm run lint`, `npm test`, and `npm run test:ui`, and `cargo clippy --locked -- -D warnings` and `cargo test --locked` on Windows, macOS, and Linux. Run them locally before you open the pull request.
- If the change is visible to users, update `README.md` and `README.pt-BR.md`.
- Don't change the version in `package.json` or `src-tauri/Cargo.toml`, and don't add version sections to the changelogs. The maintainer picks the version and writes the release notes when publishing a release, and CI rejects pull requests that change them.

## Releases

Every stable release reaches every user, so stable versions go out at most once a week and only after a soak.

- Ship work in progress as a preview: `scripts/release.sh X.Y.Z-beta.N`. The release workflow publishes it as a GitHub prerelease. The updater only reads the latest stable release, so a preview only reaches people who download it.
- Promote to `X.Y.Z` after the preview has run for a few days with no new regressions.
- The tag's release check waits for the CI run of the tagged commit and fails if that run didn't pass.

## License

By contributing, you agree that your contributions are licensed under the [GNU General Public License v3.0 or later](LICENSE), the same license as Pier.
