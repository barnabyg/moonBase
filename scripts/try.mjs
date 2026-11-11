// Starts the game in a prepared state, to try a change by hand (`npm run try --
// <scenario>`). See docs/trying-things.md. It prepares the scenario's save with
// Vite's module runner, as the play guides do, writes it to the ignored `.try/`
// folder, then opens the game in the desktop app from the dev server, at the
// address that makes the game load it (scripts/desktop-launcher.mjs).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";
import { openInDesktop } from "./desktop-launcher.mjs";

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
// `--keep` starts from the save prepared last time, for a slow scenario: it is
// what that code and catalogue made, so prepare it afresh after changing them.
const saveFile = new URL(`../.try/${chosen.id}.moonbase`, import.meta.url);
if (process.argv.includes("--keep") && existsSync(saveFile)) {
  console.log(`Keeping the ${chosen.id} save prepared last time.`);
} else {
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
  writeFileSync(saveFile, save);
}

// The page fetches the prepared save from the dev server (src/main.ts).
const url = await openInDesktop({ plugins, path: `/?try=${chosen.id}` });

console.log(`\n${chosen.title}`);
console.log(`${url}\n`);
chosen.steps.forEach((step, index) => {
  console.log(`  ${index + 1}. ${step}`);
});
console.log("\nClose the window, or press Ctrl+C here, to stop the game.");
