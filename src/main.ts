import "./ui/styles.css";
import { createGameLoop } from "./game/loop";
import { createRenderer, type Renderer } from "./render/renderer";
import { createCampaign, MAX_SEED, type Snapshot } from "./simulation";
import { createBuildMenu } from "./ui/build-menu";
import { createConstructionPanel } from "./ui/construction-panel";
import { createStatusPanel } from "./ui/status-panel";

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

const campaign = createCampaign({ seed: chooseSeed() });
const loop = createGameLoop(campaign);
const statusPanel = createStatusPanel(container, loop);
const constructionPanel = createConstructionPanel(container);
const renderer = startRenderer(container, campaign.snapshot());
// Placing a Structure needs the 3D view to point at the map.
const buildMenu =
  renderer === undefined
    ? undefined
    : createBuildMenu(container, campaign, renderer);

let lastFrameTime: number | undefined;
function frame(time: number): void {
  if (lastFrameTime !== undefined) loop.update(time - lastFrameTime);
  lastFrameTime = time;
  const snapshot = campaign.snapshot();
  statusPanel.update(snapshot);
  constructionPanel.update(snapshot);
  buildMenu?.update(snapshot);
  renderer?.render({
    current: snapshot,
    previous: loop.previous,
    tickProgress: loop.tickProgress,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
