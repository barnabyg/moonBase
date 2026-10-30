// Starts the game in a prepared state, to try a change by hand (`npm run try --
// <scenario>`). See docs/trying-things.md. It prepares the scenario's save with
// Vite's module runner, as the play guides do, writes it to the ignored `.try/`
// folder, then starts the dev server with the address that makes the game load it.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, runnerImport } from "vite";

const PORT = 5173;
const CATALOGUE_MODULE = /\/src\/catalogue\/catalogue\.ts$/;
const root = fileURLToPath(new URL("..", import.meta.url));

/** A plugin that runs the game on the crowded catalogue, as `e2e/crowded.ts` does. */
async function crowdedPlugin() {
  const { module } = await runnerImport("/test/crowded-catalogue.ts", {
    root,
    configFile: false,
    logLevel: "error",
  });
  return {
    name: "crowded-catalogue",
    enforce: "post",
    transform(code, id) {
      return CATALOGUE_MODULE.test(id.split("?")[0])
        ? module.crowdedCatalogueModule(code)
        : undefined;
    },
  };
}

const { module: listed } = await runnerImport("/test/try-scenarios.ts", {
  root,
  configFile: false,
  logLevel: "error",
});
const id = process.argv[2];
const chosen = listed.tryScenarios.find((scenario) => scenario.id === id);
if (chosen === undefined) {
  console.log("Choose what to start the game in: npm run try -- <scenario>\n");
  for (const scenario of listed.tryScenarios) {
    console.log(`  ${scenario.id}: ${scenario.title}`);
  }
  process.exit(id === undefined ? 0 : 1);
}

const plugins = chosen.crowded === true ? [await crowdedPlugin()] : [];
console.log(`Preparing ${chosen.id}...`);
// On the same catalogue as the game will run on.
const { module: prepared } = await runnerImport("/test/try-scenarios.ts", {
  root,
  configFile: false,
  logLevel: "error",
  plugins,
});
const save = prepared.tryScenarios
  .find((scenario) => scenario.id === chosen.id)
  .save();
mkdirSync(new URL("../.try/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../.try/${chosen.id}.moonbase`, import.meta.url), save);

// Firefox is the only supported browser, as in run.bat.
const firefox = `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Mozilla Firefox\\firefox.exe`;
process.env.BROWSER ??= firefox;
const address = `/?try=${chosen.id}`;
const server = await createServer({
  root,
  plugins,
  server: { port: PORT, strictPort: true, open: address },
});
await server.listen();

console.log(`\n${chosen.title}`);
console.log(`http://localhost:${PORT}${address}\n`);
chosen.steps.forEach((step, index) => {
  console.log(`  ${index + 1}. ${step}`);
});
console.log("\nPress Ctrl+C here to stop the game.");
