// Opens the game in the desktop app from the Vite dev server, for `npm run
// desktop` and `npm run try`. It compiles Electron's main process and preload
// script (electron/), starts the dev server, and launches Electron with
// MOONBASE_DEV_SERVER_URL set to the page to open, which an installed app
// ignores. Vite reloads the page on a change to the game; a change to
// electron/ needs the command run again. Closing the window, or Ctrl+C in the
// terminal, stops both.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Starts the dev server with `plugins` added to the project's Vite config,
 * and opens `path` from it (such as "/?try=crowded") in an Electron window.
 * Resolves once the window has been launched; the process exits when it
 * closes.
 */
export async function openInDesktop({ plugins = [], path = "/" } = {}) {
  // One command string, so the shell can find npm.cmd on Windows.
  const compiled = spawnSync("npm run --silent build:electron", {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (compiled.status !== 0) process.exit(compiled.status ?? 1);

  // 127.0.0.1 rather than localhost, which Vite binds to ::1 alone on Windows.
  // The usual port, or the next free one if `npm run dev` already has it.
  const server = await createServer({
    root,
    plugins,
    server: { host: "127.0.0.1" },
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0];
  if (origin === undefined) {
    console.error("The Vite dev server didn't report its address.");
    await server.close();
    process.exit(1);
  }
  const url = new URL(path, origin).href;
  console.log(`Vite dev server at ${origin}, opening ${url} in Electron...`);

  const env = { ...process.env, MOONBASE_DEV_SERVER_URL: url };
  // Set by some editors' terminals; it would start Electron as plain Node.
  delete env["ELECTRON_RUN_AS_NODE"];
  // `electron` is the path to Electron's executable when imported in Node.
  const app = spawn(String(electron), ["."], {
    cwd: root,
    stdio: "inherit",
    env,
  });

  let stopping = false;
  async function stop(code) {
    if (stopping) return;
    stopping = true;
    app.kill();
    await server.close();
    process.exit(code);
  }
  app.on("exit", (code) => void stop(code ?? 0));
  app.on("error", (error) => {
    console.error("Electron didn't start:", error);
    void stop(1);
  });
  process.on("SIGINT", () => void stop(0));
  process.on("SIGTERM", () => void stop(0));
  return url;
}
