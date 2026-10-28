import { catalogue } from "../catalogue";
import {
  researchTaskMinutes,
  type Campaign,
  type Snapshot,
} from "../simulation";
import { describeScienceReach, nextDesigns } from "./describe";
import { setText } from "./dom";
import { formatDuration, formatScience, researchTaskLabel } from "./format";
import { createScreen } from "./screen";
import { createMeter } from "./stat";

export interface ResearchTasksScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Research Tasks screen, where the player starts a Research Task to earn
 * Science: the one running, with how far it has got and how long it has
 * left, above a card for each of the others with its length, the Science
 * it pays and what that Science would do for the Designs that can be
 * unlocked next, and the completed ones below. Above them, what Science
 * buys next: the Designs that can be unlocked once there is enough. One
 * that needs a Design isn't shown until that Design is unlocked. It only sends the choice to
 * start one to the Campaign, which decides whether it is allowed and says
 * why not. The game runs on while it is open.
 */
export function createResearchTasksScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "startResearchTask">,
): ResearchTasksScreen {
  const screen = createScreen(container, {
    className: "research-tasks",
    title: "Research Tasks",
  });
  screen.lead.textContent =
    "Science is earned only by Research Tasks, and spent on the Tech Tree.";

  // The one running, or how research works while none is.
  const now = document.createElement("section");
  now.className = "screen__card";
  now.setAttribute("role", "status");
  now.setAttribute("aria-label", "Research Task running");
  const nowHeading = document.createElement("p");
  nowHeading.className = "screen__eyebrow";
  const nowName = document.createElement("p");
  nowName.className = "research-tasks__now-name";
  const nowMeter = createMeter();
  const nowDetail = document.createElement("p");
  nowDetail.className = "research-tasks__now-detail";
  now.append(nowHeading, nowName, nowMeter.element, nowDetail);

  // The Designs that Science can unlock next, so that the choice of task
  // needs no other screen.
  const buys = document.createElement("section");
  buys.className = "research-tasks__buys";
  buys.setAttribute("aria-label", "What Science buys next");
  const buysHeading = document.createElement("h3");
  buysHeading.className = "screen__section-title";
  buysHeading.textContent = "What Science buys next";
  const buysList = document.createElement("ul");
  buysList.className = "research-tasks__buys-list";
  buys.append(buysHeading, buysList);
  /** The Designs listed, to rebuild the list only when they change. */
  let buysShown: string | undefined;

  const available = createGroup("Available");
  const completed = createGroup("Completed");
  screen.body.append(now, buys, available.section, completed.section);

  const cards = catalogue.researchTasks.map((task) => {
    const card = document.createElement("article");
    card.className = "task-card";
    card.setAttribute("aria-label", task.label);
    const name = document.createElement("h4");
    name.className = "task-card__name";
    name.textContent = task.label;
    const chips = document.createElement("p");
    chips.className = "task-card__chips";
    const length = document.createElement("span");
    length.className = "chip";
    length.textContent = formatDuration(researchTaskMinutes(task));
    const pays = document.createElement("span");
    pays.className = "chip chip--science";
    pays.textContent = formatScience(task.science);
    chips.append(length, pays);
    const reach = document.createElement("p");
    reach.className = "task-card__reach";
    // Running or completed, in place of the button.
    const state = document.createElement("span");
    state.className = "task-card__state";
    const start = document.createElement("button");
    start.type = "button";
    start.className = "screen__button";
    start.textContent = "Start";
    start.setAttribute("aria-label", `Start ${task.label}`);
    start.addEventListener("click", () => {
      const result = campaign.startResearchTask(task.id);
      screen.refuse(result.ok ? undefined : result.message);
    });
    const foot = document.createElement("div");
    foot.className = "task-card__foot";
    foot.append(state, start);
    card.append(name, chips, reach, foot);
    return { task, card, reach, state, start, done: false };
  });

  return {
    open() {
      screen.open();
    },
    update(snapshot) {
      setText(screen.figure, formatScience(snapshot.science));
      const running = snapshot.researchTask;
      if (running === undefined) {
        setText(nowHeading, "Nothing running");
        setText(
          nowName,
          "Start one below. It runs by itself, with no Robot, power or Components, and pays its Science when complete.",
        );
        setText(nowDetail, "One runs at a time, and each runs only once.");
      } else {
        const task = catalogue.researchTasks.find(
          ({ id }) => id === running.researchTaskId,
        );
        setText(nowHeading, "Now running");
        setText(nowName, researchTaskLabel(running.researchTaskId));
        setText(
          nowDetail,
          `${formatDuration(running.minutesLeft)} left, then it pays ${formatScience(task?.science ?? 0)}`,
        );
      }
      now.classList.toggle("screen__card--idle", running === undefined);
      nowMeter.fill(running?.progress);

      const next = nextDesigns(snapshot);
      const nextIds = next.map((design) => design.id).join(" ");
      if (nextIds !== buysShown) {
        buysShown = nextIds;
        buysList.replaceChildren(
          ...next.map((design) => {
            // Its name and cost, with what it is on hover.
            const item = document.createElement("li");
            item.className = "chip";
            item.title = design.description;
            const cost = document.createElement("span");
            cost.className = "research-tasks__buys-cost";
            cost.textContent = formatScience(design.scienceCost);
            item.append(design.label, " ", cost);
            return item;
          }),
        );
        buys.hidden = next.length === 0;
      }

      let regrouped = false;
      for (const entry of cards) {
        const { task, card, reach, state, start } = entry;
        // One that needs a Design isn't offered until it is unlocked.
        const needed = task.requiresDesignId;
        card.hidden =
          needed !== undefined && !snapshot.unlockedDesignIds.includes(needed);
        const isRunning = running?.researchTaskId === task.id;
        const done = snapshot.completedResearchTaskIds.includes(task.id);
        setText(state, isRunning ? "Running" : done ? "✓ Completed" : "");
        const reaches = done
          ? undefined
          : describeScienceReach(snapshot, task.science);
        setText(reach, reaches ?? "");
        reach.hidden = reaches === undefined;
        card.classList.toggle("task-card--running", isRunning);
        card.classList.toggle("task-card--completed", done);
        // Another's button stays while one runs, so that starting it says
        // why it can't; it is just less prominent.
        start.hidden = isRunning || done;
        start.classList.toggle(
          "screen__button--primary",
          running === undefined,
        );
        if (entry.done !== done) {
          entry.done = done;
          regrouped = true;
        }
      }
      if (regrouped || available.list.childElementCount === 0) {
        // In catalogue order within each group.
        for (const { card, done } of cards) {
          (done ? completed : available).list.append(card);
        }
      }
      for (const group of [available, completed]) {
        const shown = [...group.list.children].filter(
          (card) => !(card as HTMLElement).hidden,
        ).length;
        group.section.hidden = shown === 0;
        setText(group.count, String(shown));
      }
    },
  };
}

/** A heading with how many cards are under it, over a grid of them. */
function createGroup(label: string): {
  readonly section: HTMLElement;
  readonly list: HTMLElement;
  readonly count: HTMLElement;
} {
  const section = document.createElement("section");
  section.className = "research-tasks__group";
  section.setAttribute("aria-label", label);
  const heading = document.createElement("h3");
  heading.className = "screen__section-title";
  const count = document.createElement("span");
  count.className = "screen__count";
  heading.append(label, " ", count);
  const list = document.createElement("div");
  list.className = "task-grid";
  section.append(heading, list);
  return { section, list, count };
}
