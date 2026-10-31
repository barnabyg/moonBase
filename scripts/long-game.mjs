// Plays the long-game play guide (`npm run long-game`) and prints its timeline.
// It exits with an error if the play guide gives up. It takes minutes, so it
// stays out of `npm run verify`. See docs/reference-campaign.md.
//
// Playing is one long synchronous call, so a timer in the same process could
// never stop it. So this runs itself again as a child process, and kills the
// child at the hard limit.
//
// The play guide is the TypeScript module, whose imports leave out file
// extensions, so plain Node can't load it; Vite's module runner, which the
// project already depends on, compiles it on the way in.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** About four and a half times the longest it has taken, so that it stops only a game that hangs. */
const HARD_LIMIT_MINUTES = 45;
const PLAY = "--play";

if (process.argv.includes(PLAY)) {
  const { runnerImport } = await import("vite");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { module } = await runnerImport("/test/long-game.ts", {
    root,
    configFile: false,
    logLevel: "error",
  });
  const started = performance.now();
  const timeline = module.playLongGame();
  const minutes = (performance.now() - started) / 60_000;
  for (const line of module.formatLongGame(timeline)) console.log(line);
  console.log(`(Played in ${minutes.toFixed(1)} minutes.)`);
  if (!module.longGameSucceeded(timeline)) process.exitCode = 1;
} else {
  const played = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), PLAY],
    { stdio: "inherit", timeout: HARD_LIMIT_MINUTES * 60_000 },
  );
  if (played.error !== undefined) {
    console.error(
      `The long game was stopped at its hard limit of ${HARD_LIMIT_MINUTES} minutes: ${played.error.message}`,
    );
    process.exitCode = 1;
  } else {
    process.exitCode = played.status ?? 1;
  }
}
