// Measures how long the game takes to draw a frame, in Firefox and Chromium, on
// fixed scenes (`npm run frame-time`). See docs/rendering-performance.md.
//
// It builds the game for production, serves the build, and opens it in each
// browser with a window, so that WebGL is drawn on the GPU as a player's is,
// not in software as headless Chromium would. Each browser draws as fast as it
// can, not at the screen's refresh rate, so the times are what a frame costs
// rather than the refresh interval. Each scene is loaded from a save with the
// game paused, warmed up, then timed by the gaps between animation frames.
//
//   npm run frame-time -- [--browser firefox|chromium] [--scene <id>]
//     [--repeats 3] [--seconds 8] [--label <name>] [--keep] [--vsync]
//
// The large base takes several minutes to prepare; --keep reuses the saves
// prepared last time, in the ignored .frame-time folder, which are what that
// code and catalogue made. The results, and a screenshot of each scene in each
// browser, go to .frame-time/<label>/.
/* global document, requestAnimationFrame, window -- in the functions page.evaluate runs in the page */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium, firefox } from "@playwright/test";
import { build, preview, runnerImport } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const workDirectory = new URL("../.frame-time/", import.meta.url);
const port = Number(process.env["FRAME_TIME_PORT"] ?? 4180);
/** The window the game is drawn in: a common desktop size, at this PC's 150% scaling. */
const VIEWPORT = { width: 1920, height: 1080 };
const DEVICE_SCALE_FACTOR = 1.5;
const WARM_UP_MS = 3000;

const { values: options } = parseArgs({
  options: {
    browser: { type: "string", multiple: true },
    scene: { type: "string", multiple: true },
    repeats: { type: "string", default: "3" },
    seconds: { type: "string", default: "8" },
    label: { type: "string", default: "latest" },
    keep: { type: "boolean", default: false },
    vsync: { type: "boolean", default: false },
  },
});
const repeats = Number(options.repeats);
const measureMs = Number(options.seconds) * 1000;

const browsers = {
  firefox: {
    type: firefox,
    launch: {
      firefoxUserPrefs: {
        // 0 draws as fast as it can; Firefox's default, -1, follows the screen.
        ...(options.vsync ? {} : { "layout.frame_rate": 0 }),
        // A window behind another would otherwise be drawn less often.
        "widget.windows.window_occlusion_tracking.enabled": false,
      },
    },
  },
  chromium: {
    type: chromium,
    launch: {
      args: options.vsync
        ? []
        : ["--disable-gpu-vsync", "--disable-frame-rate-limit"],
    },
  },
};

const { module: scenes } = await runnerImport("/test/frame-time-scenes.ts", {
  root,
  configFile: false,
  logLevel: "error",
});
const chosenScenes = scenes.frameTimeScenes.filter(
  ({ id }) => options.scene === undefined || options.scene.includes(id),
);
const chosenBrowsers = Object.keys(browsers).filter(
  (name) => options.browser === undefined || options.browser.includes(name),
);
if (chosenScenes.length === 0 || chosenBrowsers.length === 0) {
  console.log("Scenes:");
  for (const scene of scenes.frameTimeScenes) {
    console.log(`  ${scene.id}: ${scene.title}`);
  }
  console.log(`Browsers: ${Object.keys(browsers).join(", ")}`);
  process.exit(1);
}

/** Each chosen scene's save, prepared afresh or, with --keep, as last time. */
function prepareScenes() {
  mkdirSync(workDirectory, { recursive: true });
  const bases = new Map();
  return chosenScenes.map((scene) => {
    const file = new URL(`${scene.id}.json`, workDirectory);
    if (options.keep && existsSync(file)) {
      return { ...scene, ...JSON.parse(readFileSync(file, "utf8")) };
    }
    if (!bases.has(scene.base)) {
      // The base too, as the large one takes minutes to prepare.
      const baseFile = new URL(`base-${scene.base}.moonbase`, workDirectory);
      if (options.keep && existsSync(baseFile)) {
        bases.set(scene.base, readFileSync(baseFile, "utf8"));
      } else {
        console.log(`Preparing the ${scene.base} base...`);
        bases.set(scene.base, scenes.baseSave(scene.base));
        writeFileSync(baseFile, bases.get(scene.base));
      }
    }
    console.log(`Playing on to ${scene.id}...`);
    const prepared = scenes.sceneSave(scene, bases.get(scene.base));
    writeFileSync(file, JSON.stringify(prepared));
    return { ...scene, ...prepared };
  });
}

/** The value below which the given fraction of the sorted numbers lie. */
function quantile(sorted, fraction) {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(fraction * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

function median(numbers) {
  return quantile(
    [...numbers].sort((a, b) => a - b),
    0.5,
  );
}

/** Loads the scene in a fresh page, as e2e/late-game.spec.ts loads a save. */
async function openScene(context, scene) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // A missing resource is reported below with its address.
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    ) {
      errors.push(message.text());
    }
  });
  page.on("response", (response) => {
    // The game has no icon, and Chromium asks for one anyway.
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) {
      errors.push(`${response.status()} for ${response.url()}`);
    }
  });
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: `${scene.id}.moonbase`,
    mimeType: "application/json",
    buffer: Buffer.from(scene.save),
  });
  await page
    .getByRole("status", { name: "Game clock" })
    .filter({ hasText: scene.clock })
    .waitFor();
  const canvas = await page.locator("canvas").boundingBox();
  if (canvas === null) throw new Error("The 3D view has no size.");
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  // In steps, as a wheel turns.
  for (let turned = 0; turned < scene.zoomOut; turned += 100) {
    await page.mouse.wheel(0, 100);
    // Each its own event, as a browser may merge those that come at once.
    await page.waitForTimeout(50);
  }
  // Out of the way, so that nothing is highlighted under the pointer.
  await page.mouse.move(0, 0);
  return { page, errors };
}

/** The gaps between animation frames over the given time, in milliseconds. */
function frameGaps(page, milliseconds) {
  return page.evaluate(
    (milliseconds) =>
      new Promise((resolve) => {
        const times = [];
        function frame(time) {
          times.push(time);
          if (time - times[0] < milliseconds) requestAnimationFrame(frame);
          else
            resolve(times.slice(1).map((time, index) => time - times[index]));
        }
        requestAnimationFrame(frame);
      }),
    milliseconds,
  );
}

/** What draws WebGL in the page: the GPU's name, or the software renderer's. */
function webglRenderer(page) {
  return page.evaluate(() => {
    const context = document.createElement("canvas").getContext("webgl2");
    if (context === null) return "no WebGL2";
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    return String(
      context.getParameter(
        debug === null ? context.RENDERER : debug.UNMASKED_RENDERER_WEBGL,
      ),
    );
  });
}

const prepared = prepareScenes();

console.log("Building the game...");
await build({ root, logLevel: "warn" });
const server = await preview({
  root,
  logLevel: "warn",
  preview: { host: "127.0.0.1", port, strictPort: true },
});

const outDirectory = new URL(`${options.label}/`, workDirectory);
mkdirSync(outDirectory, { recursive: true });
const runs = [];
const about = {};
try {
  // Each repeat opens each browser afresh and draws every scene, so that a
  // drift in the machine's speed spreads over all of them alike.
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const name of chosenBrowsers) {
      const { type, launch } = browsers[name];
      const browser = await type.launch({ headless: false, ...launch });
      try {
        const context = await browser.newContext({
          baseURL: `http://127.0.0.1:${port}`,
          viewport: VIEWPORT,
          deviceScaleFactor: DEVICE_SCALE_FACTOR,
        });
        for (const scene of prepared) {
          const { page, errors } = await openScene(context, scene);
          about[name] ??= {
            version: browser.version(),
            renderer: await webglRenderer(page),
            devicePixelRatio: await page.evaluate(
              () => window.devicePixelRatio,
            ),
          };
          await page.waitForTimeout(WARM_UP_MS);
          const gaps = (await frameGaps(page, measureMs)).sort((a, b) => a - b);
          if (repeat === 1) {
            await page.screenshot({
              path: fileURLToPath(
                new URL(`${name}-${scene.id}.png`, outDirectory),
              ),
            });
          }
          if (errors.length > 0) {
            throw new Error(`${name}, ${scene.id}: ${errors.join("\n")}`);
          }
          const run = {
            browser: name,
            scene: scene.id,
            repeat,
            frames: gaps.length,
            medianMs: quantile(gaps, 0.5),
            p95Ms: quantile(gaps, 0.95),
          };
          runs.push(run);
          console.log(
            `${name} ${scene.id} #${repeat}: median ${run.medianMs.toFixed(2)} ms, p95 ${run.p95Ms.toFixed(2)} ms, ${run.frames} frames`,
          );
          await page.close();
        }
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  await server.close();
}

console.log(`\n${options.label}: ${repeats} repeats of ${measureMs / 1000} s`);
for (const [name, details] of Object.entries(about)) {
  console.log(
    `${name} ${details.version}, ${details.renderer}, device pixel ratio ${details.devicePixelRatio}`,
  );
}
console.log(
  "\n| Browser | Scene | Median ms (range) | p95 ms (range) |\n| --- | --- | --- | --- |",
);
const summary = [];
for (const name of chosenBrowsers) {
  for (const scene of prepared) {
    const these = runs.filter(
      (run) => run.browser === name && run.scene === scene.id,
    );
    const medians = these.map((run) => run.medianMs);
    const p95s = these.map((run) => run.p95Ms);
    const row = {
      browser: name,
      scene: scene.id,
      medianMs: median(medians),
      p95Ms: median(p95s),
    };
    summary.push(row);
    const range = (numbers) =>
      `${Math.min(...numbers).toFixed(2)}–${Math.max(...numbers).toFixed(2)}`;
    console.log(
      `| ${name} | ${scene.id} | ${row.medianMs.toFixed(2)} (${range(medians)}) | ${row.p95Ms.toFixed(2)} (${range(p95s)}) |`,
    );
  }
}
writeFileSync(
  new URL("results.json", outDirectory),
  JSON.stringify({ about, summary, runs }, undefined, 2),
);
console.log(`\nResults and screenshots: ${fileURLToPath(outDirectory)}`);
