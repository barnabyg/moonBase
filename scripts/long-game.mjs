// Plays the long-game play guide (`npm run long-game`) and prints its timeline.
// It exits with an error if the play guide gives up. It takes minutes, so it
// stays out of `npm run verify`. See docs/reference-campaign.md.
//
// Playing is one long synchronous call, so a timer in the same process could
// never stop it. So this runs itself again as a child process, and kills the
// child at the hard limit.
//
// The play guide is the TypeScript module, whose imports leave out file
// extensions, so plain Node can't load it. Vite, which the project already
// depends on, bundles it into one file first. Its module runner would do without
// the file, but reaches every import through a getter, which made a play take
// nearly twice as long.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** About three times the longest it has taken, so that it stops only a game that hangs. */
const HARD_LIMIT_MINUTES = 120;
const PLAY = "--play";

if (process.argv.includes(PLAY)) {
  const { build } = await import("vite");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const outDir = join(root, "node_modules", ".cache", "long-game");
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    build: {
      ssr: "test/long-game.ts",
      outDir,
      emptyOutDir: true,
      minify: false,
      target: "esnext",
      rollupOptions: { output: { entryFileNames: "long-game.mjs" } },
    },
  });
  const module = await import(
    pathToFileURL(join(outDir, "long-game.mjs")).href
  );
  const started = performance.now();
  // To stderr, so that the timeline on stdout stays as it was.
  const timeline = module.playLongGame(undefined, (earthDay) => {
    const elapsed = (performance.now() - started) / 60_000;
    console.error(
      `Earth Day ${earthDay} of ${module.LONG_GAME_END_EARTH_DAY}, after ${elapsed.toFixed(1)} minutes`,
    );
  });
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
