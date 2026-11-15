import { catalogue, type Design } from "../catalogue";
import {
  type Campaign,
  type DesignUnlockedEvent,
  type Snapshot,
} from "../simulation";
import { describeUnlocks } from "./describe";
import { setText } from "./dom";
import { formatScience } from "./format";
import { createScreen } from "./screen";
import {
  designBrings,
  designById,
  designSteps,
  designsLeadingFrom,
  designsNeededBefore,
  pathToDesign,
} from "./tech-tree-graph";
import { describeDesignState } from "./tech-tree-text";

export interface TechTreeScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

type DesignState = ReturnType<typeof describeDesignState>["state"];

const SVG = "http://www.w3.org/2000/svg";

/**
 * The Tech Tree screen, where the player spends Science to unlock a Design.
 * It draws the whole tree at once: a column for each category, and a row for
 * each step along it, the starting Designs at the top and every other one
 * a row below the furthest along of the Designs it needs first, with a line
 * from each of those to it. Each Design shows its name, what it lets the
 * base have and its cost, marked unlocked, ready to unlock or out of reach.
 *
 * Picking one lights up everything it needs, however far back, and what it
 * leads to, and fades the rest; a panel beside the tree says what it brings,
 * lists the Designs still to unlock to reach it in an order they can be
 * unlocked, with the Science they take in all, and has its Unlock button.
 * The screen only sends the choice to unlock one to the Campaign, which
 * decides whether it is allowed and says why not, and passes on the
 * notification of one unlocked. The game runs on while it is open.
 */
export function createTechTreeScreen(
  container: HTMLElement,
  campaign: Pick<Campaign, "unlockDesign">,
  onUnlocked: (event: DesignUnlockedEvent) => void,
): TechTreeScreen {
  const screen = createScreen(container, {
    className: "tech-tree",
    title: "Tech Tree",
  });
  screen.figure.setAttribute("role", "status");
  screen.figure.setAttribute("aria-label", "Science to spend");
  screen.lead.textContent =
    "Each Design sits below the Designs it needs first. Pick one to see what it brings and what it takes to get there. Unlocking a Design permits what it covers, but adds nothing to the base: it still has to be shipped or built.";

  const steps = designSteps();
  const categories = catalogue.designCategories.filter((category) =>
    catalogue.designs.some((design) => design.category === category.id),
  );
  const lastStep = Math.max(0, ...steps.values());

  // The tree, which scrolls, beside the panel on the Design picked.
  const map = document.createElement("div");
  map.className = "tech-tree__map";
  const grid = document.createElement("div");
  grid.className = "tech-tree__grid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Designs");
  grid.style.setProperty("--categories", String(categories.length));
  const lines = document.createElementNS(SVG, "svg");
  lines.classList.add("tech-tree__lines");
  lines.setAttribute("aria-hidden", "true");
  grid.append(lines);
  map.append(grid);

  const details = document.createElement("aside");
  details.className = "tech-tree__details";
  details.setAttribute("role", "region");
  details.setAttribute("aria-label", "Selected Design");
  screen.body.append(map, details);

  // A heading over each category's column, with how many are unlocked and a
  // mark when one can be unlocked now.
  const heads = categories.map((category, column) => {
    const head = document.createElement("div");
    head.className = "tech-tree__head";
    head.style.gridColumn = String(column + 1);
    const name = document.createElement("h3");
    name.className = "screen__section-title tech-tree__head-name";
    name.textContent = category.label;
    const tally = document.createElement("span");
    tally.className = "tech-tree__tally";
    head.append(name, " ", tally);
    grid.append(head);
    return {
      category,
      head,
      tally,
      designs: catalogue.designs.filter((d) => d.category === category.id),
    };
  });

  // A row for each step, under a label saying how far along it is.
  const nodes = new Map<string, ReturnType<typeof createNode>>();
  for (let step = 0; step <= lastStep; step++) {
    const label = document.createElement("p");
    label.className = "tech-tree__step";
    label.textContent = step === 0 ? "Starting" : `Step ${step}`;
    grid.append(label);
    for (const [column, category] of categories.entries()) {
      const cell = document.createElement("div");
      cell.className = "tech-tree__cell";
      cell.style.gridColumn = String(column + 1);
      for (const design of catalogue.designs) {
        if (design.category !== category.id || steps.get(design.id) !== step) {
          continue;
        }
        const node = createNode(design);
        nodes.set(design.id, node);
        cell.append(node.element);
      }
      grid.append(cell);
    }
  }

  // A line from each Design to each that needs it.
  const edges = catalogue.designs.flatMap((design) =>
    design.prerequisiteDesignIds.map((from) => {
      const path = document.createElementNS(SVG, "path");
      path.classList.add("tech-tree__line");
      lines.append(path);
      return { from, to: design.id, path };
    }),
  );

  function createNode(design: Design) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "tech-node";
    element.dataset["design"] = design.id;
    element.setAttribute("aria-label", design.label);
    element.setAttribute("aria-pressed", "false");
    const name = document.createElement("span");
    name.className = "tech-node__name";
    name.textContent = design.label;
    const brings = document.createElement("span");
    brings.className = "tech-node__brings";
    brings.textContent = designBrings(design).join(" · ");
    const foot = document.createElement("span");
    foot.className = "tech-node__foot";
    const cost = document.createElement("span");
    cost.className = "tech-node__cost";
    cost.textContent = design.starting
      ? "Starting"
      : formatScience(design.scienceCost);
    const mark = document.createElement("span");
    mark.className = "tech-node__mark";
    mark.setAttribute("aria-hidden", "true");
    foot.append(cost, mark);
    // Its state in words, which a screen reader reads with its name.
    const state = document.createElement("span");
    state.className = "visually-hidden";
    state.id = `tech-node-${design.id}`;
    element.setAttribute("aria-describedby", state.id);
    element.append(name, brings, foot, state);
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      select(selected === design.id ? undefined : design.id);
    });
    return { design, element, mark, state };
  }

  /** Places each line between the Designs it joins, as they are laid out now. */
  function drawLines() {
    const origin = grid.getBoundingClientRect();
    if (origin.width === 0) return;
    lines.setAttribute("width", String(grid.scrollWidth));
    lines.setAttribute("height", String(grid.scrollHeight));
    for (const { from, to, path } of edges) {
      const a = nodes.get(from)?.element.getBoundingClientRect();
      const b = nodes.get(to)?.element.getBoundingClientRect();
      if (a === undefined || b === undefined) continue;
      const x1 = a.left + a.width / 2 - origin.left;
      const y1 = a.bottom - origin.top;
      const x2 = b.left + b.width / 2 - origin.left;
      const y2 = b.top - origin.top;
      const bend = Math.max(16, Math.min(60, (y2 - y1) / 2));
      path.setAttribute(
        "d",
        `M ${x1} ${y1} C ${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`,
      );
    }
  }
  new ResizeObserver(drawLines).observe(grid);

  // The Design picked, kept between visits, and the latest snapshot.
  let selected: string | undefined;
  let latest: Snapshot | undefined;
  // What the panel was last drawn for, so it is drawn again only on a change.
  let drawnFor = "";

  map.addEventListener("click", () => {
    select(undefined);
  });

  function select(designId: string | undefined) {
    selected = designId;
    screen.refuse(undefined);
    const needed =
      designId === undefined
        ? new Set<string>()
        : designsNeededBefore(designId);
    const next = new Set(
      designId === undefined ? [] : designsLeadingFrom(designId),
    );
    grid.classList.toggle("tech-tree__grid--focused", designId !== undefined);
    for (const [id, node] of nodes) {
      node.element.setAttribute("aria-pressed", String(id === designId));
      node.element.classList.toggle("tech-node--selected", id === designId);
      node.element.classList.toggle("tech-node--needed", needed.has(id));
      node.element.classList.toggle("tech-node--next", next.has(id));
    }
    for (const { from, to, path } of edges) {
      path.classList.toggle(
        "tech-tree__line--needed",
        needed.has(from) && (to === designId || needed.has(to)),
      );
      path.classList.toggle("tech-tree__line--next", from === designId);
    }
    if (latest !== undefined) drawDetails(latest);
  }

  /** Brings a Design into view in the tree and picks it. */
  function show(designId: string) {
    select(designId);
    nodes.get(designId)?.element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }

  /** A button naming a Design, which picks it. */
  function designButton(design: Design, state: DesignState): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tech-tree__link tech-tree__link--${state}`;
    button.textContent = design.label;
    button.addEventListener("click", () => {
      show(design.id);
    });
    return button;
  }

  function section(title: string): HTMLElement {
    const part = document.createElement("section");
    part.className = "tech-tree__part";
    const heading = document.createElement("h4");
    heading.className = "tech-tree__part-title";
    heading.textContent = title;
    part.append(heading);
    details.append(part);
    return part;
  }

  function drawDetails(snapshot: Snapshot) {
    const key = `${selected ?? ""}|${snapshot.unlockedDesignIds.join(",")}`;
    if (key !== drawnFor) {
      drawnFor = key;
      fillDetails(snapshot);
    }
    refreshDetails(snapshot);
  }

  // What changes with the Science, without drawing the panel again.
  let refreshDetails: (snapshot: Snapshot) => void = () => undefined;

  function fillDetails(snapshot: Snapshot) {
    details.replaceChildren();
    refreshDetails = () => undefined;
    if (selected === undefined) {
      const hint = document.createElement("p");
      hint.className = "tech-tree__hint";
      hint.textContent =
        "Pick a Design to see what it brings, the Designs it takes to get there and what it leads to.";
      details.append(hint);
      return;
    }
    const design = designById(selected);
    const stateOf = (d: Design) => describeDesignState(d, snapshot).state;

    const eyebrow = document.createElement("p");
    eyebrow.className = "screen__eyebrow";
    const category = catalogue.designCategories.find(
      ({ id }) => id === design.category,
    );
    const step = steps.get(design.id) ?? 0;
    eyebrow.textContent = `${category?.label ?? ""} · ${step === 0 ? "Starting" : `Step ${step}`}`;
    const name = document.createElement("h3");
    name.className = "tech-tree__name";
    name.textContent = design.label;
    const top = document.createElement("div");
    top.className = "tech-tree__top";
    const cost = document.createElement("span");
    cost.className = design.starting ? "chip" : "chip chip--science";
    cost.textContent = design.starting
      ? "Starting"
      : formatScience(design.scienceCost);
    const state = document.createElement("span");
    top.append(cost, state);
    const unlock = document.createElement("button");
    unlock.type = "button";
    unlock.className = "screen__button tech-tree__unlock";
    unlock.textContent = "Unlock";
    unlock.setAttribute("aria-label", `Unlock ${design.label}`);
    unlock.addEventListener("click", () => {
      const result = campaign.unlockDesign(design.id);
      screen.refuse(result.ok ? undefined : result.message);
      if (result.ok) onUnlocked(result.event);
    });
    const description = document.createElement("p");
    description.className = "tech-tree__description";
    description.textContent = design.description;
    details.append(eyebrow, name, top, unlock, description);

    const brings = section("Brings");
    for (const text of describeUnlocks(design)) {
      const line = document.createElement("p");
      line.className = "tech-tree__brings";
      line.textContent = text;
      brings.append(line);
    }

    // The way there, in an order the player can follow, and what it costs.
    const path = pathToDesign(design.id, snapshot.unlockedDesignIds);
    let total: HTMLElement | undefined;
    if (path.length > 1) {
      const way = section("To get there");
      const list = document.createElement("ol");
      list.className = "tech-tree__path";
      for (const along of path) {
        const item = document.createElement("li");
        const price = document.createElement("span");
        price.className = "tech-tree__price";
        price.textContent = formatScience(along.scienceCost);
        item.append(designButton(along, stateOf(along)), " ", price);
        list.append(item);
      }
      total = document.createElement("p");
      total.className = "tech-tree__total";
      way.append(list, total);
    }

    if (design.prerequisiteDesignIds.length > 0) {
      const needs = section("Needs first");
      const list = document.createElement("p");
      list.className = "tech-tree__links";
      for (const id of design.prerequisiteDesignIds) {
        const need = designById(id);
        list.append(designButton(need, stateOf(need)));
      }
      needs.append(list);
    }

    const leads = designsLeadingFrom(design.id);
    if (leads.length > 0) {
      const next = section("Leads to");
      const list = document.createElement("p");
      list.className = "tech-tree__links";
      for (const id of leads) {
        const lead = designById(id);
        list.append(designButton(lead, stateOf(lead)));
      }
      next.append(list);
    }

    const pathCost = path.reduce((sum, d) => sum + d.scienceCost, 0);
    refreshDetails = (now) => {
      const described = describeDesignState(design, now);
      setText(
        state,
        described.state === "unlocked" ? "✓ Unlocked" : described.text,
      );
      state.className = `design-card__state design-card__state--${described.state}`;
      unlock.hidden = described.state === "unlocked";
      unlock.classList.toggle(
        "screen__button--primary",
        described.state === "unlockable",
      );
      if (total !== undefined) {
        setText(
          total,
          `${path.length} Designs, ${formatScience(pathCost)} in all; the base has ${formatScience(now.science)}.`,
        );
      }
    };
  }

  return {
    open() {
      screen.open();
      // Laid out only once open, so the lines follow it.
      requestAnimationFrame(drawLines);
    },
    update(snapshot) {
      latest = snapshot;
      setText(screen.figure, `${formatScience(snapshot.science)} to spend`);
      const states = new Map<string, DesignState>();
      for (const [id, node] of nodes) {
        const described = describeDesignState(node.design, snapshot);
        states.set(id, described.state);
        node.element.dataset["state"] = described.state;
        setText(
          node.mark,
          described.state === "unlocked"
            ? "✓"
            : described.state === "unlockable"
              ? "Ready"
              : "",
        );
        setText(node.state, described.text);
      }
      for (const { category, head, tally, designs } of heads) {
        const unlocked = designs.filter(
          (d) => states.get(d.id) === "unlocked",
        ).length;
        const ready = designs.some((d) => states.get(d.id) === "unlockable");
        setText(tally, `${unlocked}/${designs.length}`);
        head.classList.toggle("tech-tree__head--ready", ready);
        const name = `${category.label}, ${unlocked} of ${designs.length} unlocked${ready ? ", a Design can be unlocked now" : ""}`;
        if (head.title !== name) head.title = name;
      }
      for (const { from, path } of edges) {
        // A need already met.
        path.classList.toggle(
          "tech-tree__line--met",
          snapshot.unlockedDesignIds.includes(from),
        );
      }
      drawDetails(snapshot);
    },
  };
}
