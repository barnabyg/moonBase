// Prints how the Campaign's numbers fit together (`npm run pacing-report`),
// from the data catalogue alone, with nothing played. See
// docs/reference-campaign.md.
//
// The report is a TypeScript module whose imports leave out file extensions,
// so plain Node can't load it; Vite's module runner, which the project already
// depends on, compiles it on the way in.
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const load = (path) =>
  runnerImport(path, { root, configFile: false, logLevel: "error" });
const { module: report } = await load("/test/pacing-report.ts");
const {
  module: { catalogue },
} = await load("/src/catalogue/index.ts");

for (const line of report.formatPacingReport(catalogue)) console.log(line);
