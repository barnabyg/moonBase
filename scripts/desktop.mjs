// `npm run desktop`: plays the game in the desktop app during development,
// from the Vite dev server, with the page reloading when the game changes
// (scripts/desktop-launcher.mjs). Closing the window, or Ctrl+C here, stops it.
import { openInDesktop } from "./desktop-launcher.mjs";

await openInDesktop();
