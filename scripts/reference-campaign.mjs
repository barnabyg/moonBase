// Plays the reference Campaign (`npm run reference-campaign`) and prints its
// timeline: the Earth Day each Milestone was reached, the Launches and
// Export sales, and how close the Mission Director came to running out of
// oxygen, water, Habitat power and Funding, and to the Radiation Dose
// limit. It exits with an error if the play guide gives up. See
// docs/reference-campaign.md.
//
// The play guide is the TypeScript module the Vitest test uses, whose
// imports leave out file extensions, so plain Node can't load it; Vite's
// module runner, which the project already depends on, compiles it on the
// way in.
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const { module } = await runnerImport("/test/reference-campaign.ts", {
  root,
  configFile: false,
  logLevel: "error",
});

const started = performance.now();
const timeline = module.playReferenceCampaign();
const seconds = (performance.now() - started) / 1000;

for (const line of module.formatTimeline(timeline)) console.log(line);
console.log(`(Played in ${seconds.toFixed(1)} s.)`);
if (timeline.failure !== undefined) process.exitCode = 1;
