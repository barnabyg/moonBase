# A desktop app for Windows, built with Electron

Supersedes ADR-0004's choice of target. The rest of ADR-0004 still holds: the game is written in strict TypeScript, built with Vite and rendered in 3D with Three.js.

The game ships as a desktop app built with Electron, and Windows is the only supported platform. The browser version is dropped once the desktop app works: the Firefox end-to-end tests, their CI setup and code kept only for Firefox go, and players no longer get the game in a browser. Most end-to-end tests still run in Playwright's Chromium against the dev server, as a quick stand-in for the desktop window's engine; behaviour only the desktop app has is tested against the Electron build itself. The smallest supported screen is still 1366 × 768 px, a common laptop screen's size, where the side columns narrow to leave the map more room. The page inside the window needs at least 1366 × 660 px, a minimum set on the page rather than on the window's frame (#308), so that a maximised window fits on such a laptop, where the taskbar and title bar leave the page about 1366 × 680; in fullscreen the page gets the whole 1366 × 768.

We chose Electron because:

- It ships its own Chromium, so every player renders the game with the engine version we tested. Lighting and shadows are part of the gameplay (ADR-0004), so the renderer must look the same on every machine.
- Playwright can drive an Electron app, so the end-to-end tests carry over.
- Its main process is Node, which keeps the single TypeScript codebase (ADR-0003).
- It is a proven route to Steam.

Windows only keeps packaging, signing and CI to one platform, which is where the game is developed and played today. macOS and Linux can be added later; nothing in the game itself depends on Windows.

Dropping the browser version means one engine to test and tune rather than two, and saves (ADR-0006) can use the operating system's dialogs without keeping a download-and-file-picker path beside them. The cost is that the game can no longer be tried by opening a web page; a player installs it.

## Considered options

- **Tauri.** Smaller downloads and a Rust back end, but it renders with the operating system's web view (WebView2 on Windows, WebKit elsewhere), which differs by platform and updates on its own, so the game would run on engine versions we never tested. A Rust back end also breaks the single TypeScript codebase.
- **NW.js.** Ships Chromium like Electron, but has a much smaller community, weaker Playwright support and no comparable record of games shipped to Steam.
- **Stay in the browser (Firefox only).** No packaging work, but no route to Steam, and players' browsers update the engine under the game.
- **Keep the browser version beside the desktop app.** Two engines to test and tune, and two save and load paths, for players who can install the desktop app anyway.
- **macOS and Linux from the start.** Three installers, three signing set-ups and three CI runners before the game has its first player.
