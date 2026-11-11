# The Windows installer

The desktop app ([ADR-0010](adr/0010-electron-desktop-app-for-windows.md)) is installed with an installer built by [electron-builder](https://www.electron.build/), pinned in `package.json`. It is unsigned for now: signing, publishing to GitHub Releases and updating the installed game are [#311](https://github.com/barnabyg/moonBase/issues/311).

## Building it

From a clean checkout, in the repository's root folder:

```powershell
npm.cmd ci
npm.cmd run package:win
```

`package:win` runs `npm run build:desktop` (the game into `dist/`, `electron/` into `dist-electron/`), then `electron-builder --win --publish never`. It writes into the ignored `release/` folder:

- `Moon-Base-Setup-<version>.exe`: the installer, with the version from `package.json`.
- `win-unpacked/`: the packaged app the installer installs, which runs as it is (`release\win-unpacked\Moon Base.exe`).
- `latest.yml` and the `.blockmap`: what electron-updater will read to find and download an update (#311). Nothing uses them yet.

It takes about 35 seconds on the maintainer's PC. The first run downloads Electron's Windows build (unless `npm ci` already left it in `%LOCALAPPDATA%\electron\Cache`) and electron-builder's NSIS and 7-Zip tools (into `%LOCALAPPDATA%\electron-builder\Cache`, about 17 MB).

### Size

At version 0.1.0 (Electron 45.3.0, electron-builder 26.18.1):

| What                                       | Size                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| The installer, `Moon-Base-Setup-0.1.0.exe` | 112,850,998 bytes (113 MB, 108 MiB); builds differ by a few hundred bytes |
| The installed app                          | about 311 MB                                                              |
| The game's own files, `app.asar`           | about 1.3 MB                                                              |

Nearly all of it is Electron's Chromium. Only the English locales are packed (`electronLanguages`), which saves about 48 MB installed.

## What it packs and installs

The configuration is `package.json`'s `build` field:

- `appId` `io.github.barnabyg.moonbase`. The installer derives its registry keys from it, so an update only replaces an installed version with the same `appId`. Don't change it once players have installed the game.
- `productName` "Moon Base", which names the `.exe`, the shortcuts and the Apps list entry. The icon is `assets/icon/icon.ico` (below), on the `.exe`, the installer, the shortcuts and the window.
- `files`: only `dist/`, `dist-electron/`, the icon and `package.json` go into `app.asar`. The packaged app needs no `node_modules`: Vite bundles Three.js into `dist/`, so `three` is a dev dependency, and the app has no runtime dependencies for electron-builder to pack.
- `npmRebuild: false`: there are no native modules to rebuild.
- `nsis`: a one-click installer that installs for the current user, without administrator rights, into `%LOCALAPPDATA%\Programs\moon-base`, with a Start menu shortcut and a desktop shortcut, both "Moon Base". It adds an entry to Settings > Apps > Installed apps (the registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\0379db2f-4bc6-5d87-824b-3532c7a593ad`) and starts the game when it finishes (not when run silently with `/S`).
- `assets/installer/installer.nsh` (`nsis.include`) adds one step to the uninstaller (below).

The installer also keeps a copy of itself, about 113 MB, in `%LOCALAPPDATA%\moon-base-updater\installer.exe`, which electron-updater uses for differential downloads.

### Uninstalling, and what it leaves

Uninstalling, from Settings > Apps > Installed apps, removes the install folder, both shortcuts, the registry keys, and the installer's copy in `%LOCALAPPDATA%\moon-base-updater` (which electron-builder's own uninstaller leaves behind; `installer.nsh` removes it, except during an update).

It never touches save files: they are wherever the player saved them, by default in Documents, and the uninstaller only deletes what the installer put there.

It also leaves the app's user-data folder, `%APPDATA%\moon-base`, which holds the window's size and place (`window-state.json`), the folder last saved to (`save-folder.json`), what the game keeps in `localStorage` (folded sections) and Chromium's caches. `deleteAppDataOnUninstall` is `false`, electron-builder's default, so reinstalling keeps the player's window and folder. It is named after `package.json`'s `name`, so `npm.cmd run desktop` and `desktop:start` use the same folder on a developer's PC. Running the uninstaller with `--delete-app-data` deletes that folder (and `%APPDATA%\Moon Base`); a player who saved into it would lose those saves, which is why it isn't the default.

## The icon

`scripts/make-icon.mjs` draws the icon, a crescent Moon over a domed base on the lunar surface, with Node's built-in modules alone, and writes `assets/icon/icon.png` (256 × 256) and `assets/icon/icon.ico` (16 to 256 px). Both are committed; to change the icon, change the script and run it again:

```powershell
node scripts/make-icon.mjs
```

## Testing it

### The packaged app's smoke test

The Playwright project `packaged` (`e2e/packaged/packaged.spec.ts`) launches `release\win-unpacked\Moon Base.exe`, the files the installer installs, and checks that it starts from `app.asar` as a packaged app with `package.json`'s version, opens a visible "Moon Base" window at `app://moonbase/` with no developer tools, draws with WebGL2 and logs no errors, and ignores `MOONBASE_DEV_SERVER_URL` and `MOONBASE_USER_DATA_DIR`, which only a development run obeys. A packaged app would otherwise use the player's own `%APPDATA%\moon-base`, so the test gives it a new folder with the `--user-data-dir` switch and removes it after. It takes about 4 seconds:

```powershell
npm.cmd run package:win
npx.cmd playwright test --project=packaged
```

It is skipped when `release\win-unpacked` hasn't been built, so `npm.cmd run verify` passes without it. It tests whatever was built last, so run `package:win` first.

### Installing and uninstalling by hand

electron-builder's one-click installer writes to the current user's profile only, but test it on a clean Windows machine or VM if you can, so nothing else installed can hide a missing file. Build the installer, copy `release\Moon-Base-Setup-<version>.exe` there (or download it from the Installer workflow's run, below), and:

1. Run the installer. Expected: no administrator prompt (Windows SmartScreen warns about an unknown publisher, as it is unsigned: More info > Run anyway); a short progress window, then the game opens in a window titled "Moon Base" with the Moon Base icon in the title bar and the taskbar.
2. Play a little: build a Solar array, let the clock run. Save with the Save button into Documents, close the window, and check that closing asked nothing.
3. Start the game from the Start menu entry "Moon Base". Expected: it opens where the window was left. Load the save. Expected: the Campaign carries on from it.
4. Check Settings > Apps > Installed apps lists "Moon Base 0.1.0" (with the version being tested) by Barnaby Golden.
5. Uninstall it from there. Expected: no administrator prompt; `%LOCALAPPDATA%\Programs\moon-base`, `%LOCALAPPDATA%\moon-base-updater`, the Start menu entry and the desktop shortcut are gone, and the save in Documents and `%APPDATA%\moon-base` are still there.

In PowerShell, these check step 5:

```powershell
Test-Path "$env:LOCALAPPDATA\Programs\moon-base"                                 # False
Test-Path "$env:LOCALAPPDATA\moon-base-updater"                                  # False
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Moon Base.lnk"     # False
Test-Path "$([Environment]::GetFolderPath('Desktop'))\Moon Base.lnk"             # False
Test-Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\0379db2f-4bc6-5d87-824b-3532c7a593ad"  # False
Test-Path "$env:APPDATA\moon-base"                                               # True
```

The installer and uninstaller also run silently, for scripted tests: `.\Moon-Base-Setup-0.1.0.exe /S`, then `& "$env:LOCALAPPDATA\Programs\moon-base\Uninstall Moon Base.exe" /currentuser /S`.

### What has been tested

On 2026-11-11, on the maintainer's development PC (Windows 11 Pro), not a clean machine: the installer for 0.1.0 installed silently with `/S` in about 18 seconds without administrator rights. It added the install folder, the Start menu and desktop shortcuts (pointing at `Moon Base.exe`), the uninstall registry key (`Moon Base 0.1.0`, publisher Barnaby Golden) and the installer's own copy, and nothing else in the user's registry, Start menu, desktop, Documents or `%APPDATA%`. The installed `Moon Base.exe` started both from the Start menu shortcut and under Playwright, where it drew the game at Earth Day 1. The silent uninstall then removed all of those, left `%APPDATA%\moon-base` exactly as the game had left it, and left everything else as it was before the install. Playing, saving and loading in the installed game were left to be done by hand.

On 2026-11-11 the maintainer then built the installer, installed it on a clean machine and played the game there by hand, and everything worked. Uninstalling was tested only on the development PC, above.

## CI

`.github/workflows/installer.yml` builds the installer on a Windows runner with `npm run package:win`, runs the packaged app's smoke test, and keeps the installer as the run's `moon-base-setup-windows` artifact: 30 days from `main`, 7 from a pull request. Download it from the run's Summary page under Artifacts.

It runs on every push to `main` that can change the app (not one changing only `docs/` or Markdown), and on a pull request only when it changes what the installer is built from or how: `electron/`, `assets/`, `e2e/packaged/`, `package.json`, `package-lock.json` or the workflow itself. Those changes can break packaging while every other check passes, so they find out before they merge; other pull requests leave it to `main`, saving a Windows runner each.

Electron's download and electron-builder's tools are kept in GitHub's cache, keyed on their pinned versions. The job's limit is 25 minutes, with 6 for `npm ci` and 10 for building the installer, several times what building it takes on the maintainer's PC (about 35 seconds), as Windows runners are slower and a cache miss downloads over 100 MB. Its CI times are not yet measured.
