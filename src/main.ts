import "./ui/styles.css";
import { createCampaignSlot } from "./game/campaign-slot";
import { createGameLoop } from "./game/loop";
import { createSaveFiles } from "./game/save-files";
import { createRenderer, type Renderer } from "./render/renderer";
import { createCampaign, MAX_SEED, type Snapshot } from "./simulation";
import { createBasePanel } from "./ui/base-panel";
import { createBuildMenu } from "./ui/build-menu";
import { createConstructionPanel } from "./ui/construction-panel";
import { createExpeditionsScreen } from "./ui/expeditions";
import { createGameOverScreen } from "./ui/game-over";
import { createLaunchManifestScreen } from "./ui/launch-manifest";
import { createNotificationList } from "./ui/notifications";
import { createRefusal } from "./ui/refusal";
import { createStatusPanel } from "./ui/status-panel";
import { createTopBar } from "./ui/top-bar";

/**
 * A valid `?seed=` in the address replays a Campaign exactly; otherwise, or if
 * the seed is out of range, each Campaign gets a new seed.
 */
function chooseSeed(): number {
  const requested = new URLSearchParams(window.location.search).get("seed");
  if (
    requested !== null &&
    /^\d+$/.test(requested) &&
    Number(requested) <= MAX_SEED
  ) {
    return Number(requested);
  }
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

const container = document.querySelector<HTMLElement>("#app");
if (container === null) throw new Error("The page has no #app element.");

/**
 * Starts the 3D view. If the browser can't give it a WebGL2 context, the
 * Campaign and status panel keep running and the player is told why the base
 * map is missing.
 */
function startRenderer(
  container: HTMLElement,
  snapshot: Snapshot,
): Renderer | undefined {
  try {
    return createRenderer(container, snapshot);
  } catch (error) {
    console.error(error);
    const message = document.createElement("p");
    message.className = "renderer-unavailable";
    message.setAttribute("role", "alert");
    message.textContent =
      "Moon Base couldn't start the 3D view, because Firefox couldn't create a WebGL2 context. " +
      "Check that hardware acceleration is turned on in Firefox's settings, then reload the page.";
    container.append(message);
    return undefined;
  }
}

// A Campaign loaded from a save file takes the place of the one in the slot.
const campaign = createCampaignSlot(createCampaign({ seed: chooseSeed() }));
const saveFiles = createSaveFiles(campaign, () => {
  loop.startAfresh();
  notifications.startAfresh();
  constructionPanel.startAfresh();
  basePanel.startAfresh();
  renderer?.startAfresh();
});
// The top bar across the screen; below it, the status panel above the build
// menu on the left, and the Work and Base panels above the notifications on
// the right. Each column scrolls its longest panel rather than running
// under the next when it grows.
const topBarSlot = document.createElement("div");
topBarSlot.className = "top-bar-slot";
const leftColumn = document.createElement("div");
leftColumn.className = "left-column";
const rightColumn = document.createElement("div");
rightColumn.className = "right-column";
container.append(topBarSlot, leftColumn, rightColumn);
const showResult = createRefusal(container);
const launchManifest = createLaunchManifestScreen(container, campaign);
const expeditions = createExpeditionsScreen(container, campaign);
const constructionPanel = createConstructionPanel(rightColumn, campaign);
const basePanel = createBasePanel(rightColumn, campaign, showResult);
const notifications = createNotificationList(rightColumn);
const loop = createGameLoop(campaign, {
  onEvents: (events) => {
    notifications.add(events);
  },
});
const topBar = createTopBar(topBarSlot, loop, saveFiles, showResult, () => {
  launchManifest.open();
});
const statusPanel = createStatusPanel(leftColumn, campaign, showResult, () => {
  expeditions.open();
});
// A new Campaign starts the page afresh, keeping any ?seed= in the address.
const gameOver = createGameOverScreen(
  container,
  () => {
    window.location.reload();
  },
  saveFiles,
);
const renderer = startRenderer(container, campaign.snapshot());
// Placing a Structure needs the 3D view to point at the map.
const buildMenu =
  renderer === undefined
    ? undefined
    : createBuildMenu(leftColumn, campaign, renderer);

let lastFrameTime: number | undefined;
function frame(time: number): void {
  if (lastFrameTime !== undefined) loop.update(time - lastFrameTime);
  lastFrameTime = time;
  const snapshot = campaign.snapshot();
  topBar.update(snapshot);
  statusPanel.update(snapshot, campaign.forecasts());
  basePanel.update(snapshot);
  constructionPanel.update(snapshot);
  launchManifest.update(snapshot);
  expeditions.update(snapshot);

  buildMenu?.update(snapshot);
  gameOver.update(snapshot);
  renderer?.render({
    current: snapshot,
    previous: loop.previous,
    tickProgress: loop.tickProgress,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
