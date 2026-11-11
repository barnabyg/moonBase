// `npm run desktop`: plays the game in the desktop app during development. It
// compiles Electron's main process and preload script (electron/), starts the
// Vite dev server, and opens the game from it in an Electron window. Vite
// reloads the page on a change to the game, as in the browser; a change to
// electron/ needs the command run again. Closing the window, or Ctrl+C here,
// stops both.
import { spawn, spawnSync } from "node:child_process";
import electron from "electron";
import { createServer } from "vite";

// One command string, so the shell can find npm.cmd on Windows.
const compiled = spawnSync("npm run --silent build:electron", {
  stdio: "inherit",
  shell: true,
});
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

// 127.0.0.1 rather than localhost, which Vite binds to ::1 alone on Windows.
// The usual port, or the next free one if `npm run dev` already has it.
const server = await createServer({ server: { host: "127.0.0.1" } });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (url === undefined) {
  console.error("The Vite dev server didn't report its address.");
  await server.close();
  process.exit(1);
}
console.log(`Vite dev server at ${url}, opening it in Electron...`);

const env = { ...process.env, MOONBASE_DEV_SERVER_URL: url };
// Set by some editors' terminals; it would start Electron as plain Node.
delete env["ELECTRON_RUN_AS_NODE"];
// `electron` is the path to Electron's executable when imported in Node.
const app = spawn(String(electron), ["."], { stdio: "inherit", env });

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
