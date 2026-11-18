import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

if (git("status", "--porcelain") !== "") {
  throw new Error(
    "Run metrics from a clean checkout to report the tested Git SHA.",
  );
}
const commit = git("rev-parse", "HEAD");

const { module } = await runnerImport("/test/reference-campaign.ts", {
  root,
  configFile: false,
  logLevel: "error",
});
const timeline = module.playReferenceCampaign();
if (timeline.failure !== undefined) {
  console.log(`The reference Campaign stopped early: ${timeline.failure}`);
}

const milestones = [
  { id: "landing-pad", label: "Landing Pad Milestone" },
  { id: "oxygen-self-sufficient", label: "Oxygen self-sufficiency Milestone" },
  { id: "water-self-sufficient", label: "Water self-sufficiency Milestone" },
];
const metrics = milestones.map(({ id, label }) => {
  const reached = timeline.milestones.find(
    ({ milestoneId }) => milestoneId === id,
  );
  return {
    id: `${id}.elapsed-minutes`,
    label: `Time to ${label}`,
    value: reached?.atMinute ?? null,
    unit: "game-minutes",
    sampleSize: reached === undefined ? 0 : 1,
  };
});

const report = {
  schemaVersion: 1,
  commit,
  generatedAt: new Date().toISOString(),
  suites: [{ id: "reference-campaign", version: 1, area: "pacing", metrics }],
};
await writeFile(
  new URL("../metrics.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
);
