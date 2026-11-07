import { catalogue } from "../catalogue";
import {
  researchTaskMinutes,
  roundMinutes,
  type Campaign,
  type Snapshot,
} from "../simulation";
import { describeScienceReach, nextDesigns } from "./describe";
import { setText } from "./dom";
import { formatDuration, formatScience } from "./format";
import { researchTaskLabel } from "./labels";
import {
  formatExperimentsLabs,
  formatObservingProgramme,
  formatResearchRate,
} from "./status-panel-text";
import { holdHeight } from "./hold";
import { createScreen } from "./screen";
import { createMeter } from "./stat";

export interface ResearchTasksScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Research Tasks screen, where the player starts a Research Task to earn
 * Science: the one running, with how far it has got and how long it has
 * left, those queued behind it in order, each of which can be removed, and the
 * observing programme the base's telescopes work on beside it,
 * above a card for each of the others with its length, the Science
 * it pays and what that Science would do for the Designs that can be
 * unlocked next, and the completed ones below. Above them, what Science
 * buys next: the Designs that can be unlocked once there is enough. One
 * that needs a Design isn't shown until that Design is unlocked. It only sends the choice to
 * start, queue or remove one to the Campaign, which decides whether it is
 * allowed and says why not. The game runs on while it is open.
 */
export function createResearchTasksScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "queueResearchTask" | "removeQueuedResearchTask">,
): ResearchTasksScreen {
  const screen = createScreen(container, {
    className: "research-tasks",
    title: "Research Tasks",
  });
  screen.lead.textContent =
    "Science is earned by Research Tasks, and by the rounds of growing of Greenhouses and growing halls, and spent on the Tech Tree.";

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
  // What the automated experiments labs are doing for it, if the base has any.
  const nowLabs = document.createElement("p");
  nowLabs.className = "research-tasks__now-detail";
  nowLabs.setAttribute("aria-label", "Automated experiments labs");
  now.append(nowHeading, nowName, nowMeter.element, nowDetail, nowLabs);
  // Its name and countdown change length as it runs; the lines below them,
  // and the cards, keep their places.
  for (const [line, row] of [
    [nowName, "Research Task running"],
    [nowDetail, "Research Task time left"],
    [nowLabs, "Automated experiments labs"],
  ] as const) {
    line.dataset["row"] = row;
    holdHeight(line);
  }

  // Those waiting behind the one running, the next to start first. It keeps a
  // row for each place, so that what is below stays put as the queue moves on.
  const queued = document.createElement("section");
  queued.className = "research-tasks__queue";
  queued.setAttribute("aria-label", "Research queue");
  const queuedHeading = document.createElement("h3");
  queuedHeading.className = "screen__section-title";
  const queuedCount = document.createElement("span");
  queuedCount.className = "screen__count";
  queuedHeading.append("Queued ", queuedCount);
  const queuedList = document.createElement("ol");
  queuedList.className = "research-tasks__queue-list";
  queued.append(queuedHeading, queuedList);
  const queuedRows = Array.from(
    { length: catalogue.researchQueueLimit },
    (_, place) => {
      const item = document.createElement("li");
      item.className = "research-tasks__queue-item";
      const name = document.createElement("span");
      name.className = "research-tasks__queue-name";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "screen__button";
      remove.textContent = "Remove";
      item.append(name, remove);
      item.dataset["row"] = `Research queue ${place + 1}`;
      holdHeight(item);
      queuedList.append(item);
      const row = { item, name, remove, id: undefined as string | undefined };
      remove.addEventListener("click", () => {
        if (row.id === undefined) return;
        const result = campaign.removeQueuedResearchTask(row.id);
        screen.refuse(result.ok ? undefined : result.message);
      });
      return row;
    },
  );

  // The observing programme, the standing Research Task the base's
  // telescopes work on at Night alongside the one running, so that the
  // player sees where that Science comes from too.
  const programme = catalogue.observingProgramme;
  const standing = document.createElement("section");
  standing.className = "screen__card";
  standing.setAttribute("role", "status");
  standing.setAttribute("aria-label", "Observing programme");
  const standingHeading = document.createElement("p");
  standingHeading.className = "screen__eyebrow";
  standingHeading.textContent = "Standing Research Task";
  const standingName = document.createElement("p");
  standingName.className = "research-tasks__now-name";
  standingName.textContent = programme.label;
  const standingMeter = createMeter();
  const standingDetail = document.createElement("p");
  standingDetail.className = "research-tasks__now-detail";
  standing.append(
    standingHeading,
    standingName,
    standingMeter.element,
    standingDetail,
  );
  // What the telescopes are doing changes with Night and their rounds; the
  // lines below keep their places.
  standingDetail.dataset["row"] = "Observing programme state";
  holdHeight(standingDetail);
  const pays = `each round pays ${formatScience(programme.science)}`;

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
  screen.body.append(
    now,
    queued,
    standing,
    buys,
    available.section,
    completed.section,
  );

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
    // Running, queued or completed, in place of the button.
    const state = document.createElement("span");
    state.className = "task-card__state";
    const start = document.createElement("button");
    start.type = "button";
    start.className = "screen__button";
    start.addEventListener("click", () => {
      const result = campaign.queueResearchTask(task.id);
      screen.refuse(result.ok ? undefined : result.message);
    });
    const foot = document.createElement("div");
    foot.className = "task-card__foot";
    foot.append(state, start);
    card.append(name, chips, reach, foot);
    card.dataset["row"] = task.id;
    holdHeight(card);
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
        setText(
          nowDetail,
          `One runs at a time, ${catalogue.researchQueueLimit} more can queue behind it, and each runs only once.`,
        );
      } else {
        const task = catalogue.researchTasks.find(
          ({ id }) => id === running.researchTaskId,
        );
        setText(nowHeading, "Now running");
        setText(nowName, researchTaskLabel(running.researchTaskId));
        setText(
          nowDetail,
          `${formatDuration(running.minutesLeftAtRate)} left${running.rate > 1 ? ` at ${formatResearchRate(running.rate)}` : ""}, then it pays ${formatScience(task?.science ?? 0)}`,
        );
      }
      const labs = formatExperimentsLabs(snapshot);
      setText(nowLabs, labs ?? "");
      nowLabs.hidden = labs === undefined;
      now.classList.toggle("screen__card--idle", running === undefined);
      nowMeter.fill(running?.progress);

      const queue = snapshot.researchQueue;
      setText(
        queuedCount,
        `${queue.length} of ${catalogue.researchQueueLimit}`,
      );
      for (const [place, row] of queuedRows.entries()) {
        const id = queue[place];
        if (row.id === id && row.name.textContent !== "") continue;
        row.id = id;
        row.item.classList.toggle(
          "research-tasks__queue-item--empty",
          id === undefined,
        );
        setText(row.name, id === undefined ? "Empty" : researchTaskLabel(id));
        row.remove.hidden = id === undefined;
        if (id !== undefined) {
          row.remove.setAttribute(
            "aria-label",
            `Remove ${researchTaskLabel(id)} from the queue`,
          );
        }
      }

      const observing = formatObservingProgramme(snapshot.observingProgramme);
      setText(
        standingDetail,
        observing === undefined
          ? `Telescopes work on it at Night, alongside the task running, and ${pays} for every ${formatDuration(roundMinutes())} of a telescope's observing. The base has none yet.`
          : `${observing.note ?? ""}; ${pays}`,
      );
      standing.classList.toggle(
        "screen__card--idle",
        snapshot.observingProgramme.observing === 0,
      );
      standingMeter.fill(
        observing === undefined
          ? undefined
          : snapshot.observingProgramme.progress,
      );

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
        const place = queue.indexOf(task.id);
        const isQueued = place !== -1;
        setText(
          state,
          isRunning
            ? "Running"
            : isQueued
              ? `Queued ${place + 1}`
              : done
                ? "✓ Completed"
                : "",
        );
        const reaches = done
          ? undefined
          : describeScienceReach(snapshot, task.science);
        setText(reach, reaches ?? "");
        reach.hidden = reaches === undefined;
        card.classList.toggle("task-card--running", isRunning);
        card.classList.toggle("task-card--completed", done);
        // Another's button stays while one runs, to queue it, or to say why
        // it can't be; it is just less prominent.
        start.hidden = isRunning || isQueued || done;
        const verb = running === undefined ? "Start" : "Queue";
        setText(start, verb);
        const name = `${verb} ${task.label}`;
        if (start.getAttribute("aria-label") !== name) {
          start.setAttribute("aria-label", name);
        }
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
