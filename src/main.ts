import "./ui/styles.css";
import { createGameLoop } from "./game/loop";
import { createRenderer } from "./render/renderer";
import { createCampaign } from "./simulation";
import { createStatusPanel } from "./ui/status-panel";

/** A `?seed=` in the address replays a Campaign exactly; otherwise each Campaign gets a new seed. */
function chooseSeed(): number {
  const requested = new URLSearchParams(window.location.search).get("seed");
  if (requested !== null && /^\d+$/.test(requested)) return Number(requested);
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

const container = document.querySelector<HTMLElement>("#app");
if (container === null) throw new Error("The page has no #app element.");

const campaign = createCampaign({ seed: chooseSeed() });
const loop = createGameLoop(campaign);
const renderer = createRenderer(container, campaign.snapshot());
const statusPanel = createStatusPanel(container, loop);

let lastFrameTime: number | undefined;
function frame(time: number): void {
  if (lastFrameTime !== undefined) loop.update(time - lastFrameTime);
  lastFrameTime = time;
  const snapshot = campaign.snapshot();
  statusPanel.update(snapshot);
  renderer.render(snapshot);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
