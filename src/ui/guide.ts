import { catalogue } from "../catalogue";
import { designLabel, type Snapshot } from "../simulation";
import {
  describeBuild,
  describeComponentUse,
  describeStructure,
  describeUnlocks,
  designOf,
  formatHours,
} from "./describe";
import { setText } from "./dom";
import {
  describeDesignState,
  formatLaunchItem,
  formatMillionDollars,
  formatScience,
  listInWords,
  stockLabel,
} from "./format";
import { createScreen } from "./screen";

export interface GuideScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Guide screen, for a player who wants to know how the base works and
 * what each thing on it does, without leaving the game. A tab says how
 * the base works; the others describe every Structure, the Robot, the
 * Machines and the Rover, and every technology in the Tech Tree, with what
 * unlocking it brings. Every figure and every list in it comes from the
 * data catalogue, so that they never drift from the game. The game runs on
 * while it is open.
 */
export function createGuideScreen(container: HTMLElement): GuideScreen {
  const screen = createScreen(container, {
    className: "guide",
    title: "Guide",
  });
  screen.lead.textContent =
    "How the base works, and what every Structure, Component, Machine and technology does.";
  const [basics, structures, components, fleet, technologies] = screen.addTabs(
    "Topics",
    [
      { id: "basics", label: "How it works" },
      { id: "structures", label: "Structures" },
      { id: "components", label: "Components" },
      { id: "fleet", label: "Robots & Machines" },
      { id: "technologies", label: "Technologies" },
    ],
  );
  if (
    basics === undefined ||
    structures === undefined ||
    components === undefined ||
    fleet === undefined ||
    technologies === undefined
  ) {
    throw new Error("The Guide has no tabs.");
  }

  const topics = createGrid(basics.panel);
  for (const topic of basicTopics()) {
    topics.append(createCard(topic.title, topic.paragraphs).element);
  }

  // Each Structure under the category of its Design, as the Tech Tree has it.
  const structureCards = catalogue.designCategories.flatMap((category) => {
    const types = catalogue.structureTypes.filter(
      (type) => designOf(type.designId)?.category === category.id,
    );
    if (types.length === 0) return [];
    const grid = createGrid(structures.panel, category.label);
    return types.map((type) => {
      const card = createCard(type.label, [
        designOf(type.designId)?.description ?? "",
        describeStructure(type),
        describeBuild(type),
      ]);
      const state = card.addState();
      grid.append(card.element);
      return { type, state };
    });
  });

  // Each Component, with what it is for and what a Launch of one costs.
  const componentGrid = createGrid(components.panel);
  const componentCards = catalogue.componentTypes.map((component) => {
    const item = catalogue.launch.items.find(
      ({ brings }) =>
        brings.kind === "component" && brings.componentId === component.id,
    );
    const card = createCard(component.label, [
      describeComponentUse(component.id),
      item === undefined
        ? "Not shipped from Earth."
        : `On the Launch manifest: ${formatLaunchItem(item)}.`,
    ]);
    const state = card.addState();
    componentGrid.append(card.element);
    return { component, item, state };
  });

  const fleetGrid = createGrid(fleet.panel);
  for (const [title, description] of [
    ["Robot", catalogue.robot.description],
    ...catalogue.machineTypes.map((type) => [type.label, type.description]),
    [catalogue.rover.label, catalogue.rover.description],
  ] as const) {
    fleetGrid.append(createCard(title, [description]).element);
  }

  const designCards = catalogue.designCategories.flatMap((category) => {
    const designs = catalogue.designs.filter(
      (design) => design.category === category.id,
    );
    if (designs.length === 0) return [];
    const grid = createGrid(technologies.panel, category.label);
    return designs.map((design) => {
      const card = createCard(design.label, [
        design.description,
        ...(design.prerequisiteDesignIds.length === 0
          ? []
          : [
              `Needs ${listInWords(design.prerequisiteDesignIds.map(designLabel))} first.`,
            ]),
        ...describeUnlocks(design),
      ]);
      if (design.starting) card.addChip("Starting", "chip");
      else
        card.addChip(formatScience(design.scienceCost), "chip chip--science");
      const state = card.addState();
      grid.append(card.element);
      return { design, state };
    });
  });

  return {
    open() {
      screen.open();
    },
    update(snapshot) {
      for (const { type, state } of structureCards) {
        setText(
          state,
          snapshot.unlockedDesignIds.includes(type.designId)
            ? "Unlocked"
            : `Needs the ${designLabel(type.designId)} Design`,
        );
      }
      for (const { component, item, state } of componentCards) {
        const inStock =
          snapshot.stockpile.components.find(
            ({ componentId }) => componentId === component.id,
          )?.count ?? 0;
        setText(
          state,
          item === undefined ||
            snapshot.unlockedDesignIds.includes(item.designId)
            ? `${inStock} in the base's stock`
            : `Needs the ${designLabel(item.designId)} Design to ship`,
        );
      }
      for (const { design, state } of designCards) {
        setText(state, describeDesignState(design, snapshot).text);
      }
    },
  };
}

/** A grid of cards in a tab, under a heading if there is one. */
function createGrid(panel: HTMLElement, heading?: string): HTMLElement {
  if (heading !== undefined) {
    const title = document.createElement("h3");
    title.className = "screen__section-title guide__heading";
    title.textContent = heading;
    panel.append(title);
  }
  const grid = document.createElement("div");
  grid.className = "guide__grid";
  panel.append(grid);
  return grid;
}

/** A card with a title and paragraphs, and room for a chip and a state line. */
function createCard(
  title: string,
  paragraphs: readonly string[],
): {
  readonly element: HTMLElement;
  addChip(text: string, className: string): void;
  addState(): HTMLElement;
} {
  const element = document.createElement("article");
  element.className = "design-card guide-card";
  element.setAttribute("aria-label", title);
  const top = document.createElement("div");
  top.className = "design-card__top";
  const name = document.createElement("h4");
  name.className = "design-card__name";
  name.textContent = title;
  top.append(name);
  element.append(top);
  for (const text of paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.className = "design-card__description";
    paragraph.textContent = text;
    element.append(paragraph);
  }
  return {
    element,
    addChip(text, className) {
      const chip = document.createElement("span");
      chip.className = className;
      chip.textContent = text;
      top.append(chip);
    },
    addState() {
      const state = document.createElement("p");
      state.className = "design-card__state guide-card__state";
      element.append(state);
      return state;
    },
  };
}

/** How the base works, a topic at a time. */
function basicTopics(): { title: string; paragraphs: string[] }[] {
  const {
    lunation,
    maintenance,
    robot,
    cold,
    launch,
    radiation,
    lightReserveHours,
  } = catalogue;
  return [
    {
      title: "Your job",
      paragraphs: [
        "You are the Mission Director. You decide what to build and what each Launch brings from Earth; the Robot does all the work by itself.",
        "Pick a Structure in the build menu and click the map to plan it. The Robot fetches its Components from the stockpile, a Machine prepares the site, and the Robot assembles it, lays it a power cable and commissions it. The Work panel shows what it is doing.",
        "The Milestones at the top of the status panel say what to do next.",
      ],
    },
    {
      title: "Power and Night",
      paragraphs: [
        `A Lunation is ${lunation.daylightEarthDays} Earth Days of Daylight and ${lunation.nightEarthDays} of Night. Solar arrays generate only in Daylight; battery banks store the surplus and carry the base through the Night. Only Structures joined by cable share power.`,
        "The Habitat is supplied first. If it loses power with the Mission Director inside, they die, so build enough battery banks before Night falls: the status panel shows how long the stored power will last.",
        `Machines and the Rover parked within ${cold.plugInReachMetres} m of a powered Structure draw power for their heaters at Night, and the Robot parks them before Night falls; left in the cold, they wear down.`,
        "Plants work in batches of an hour of their recipe: each starts once there is an hour's worth of every input in stock, and its outputs come as it finishes. The Base panel says what each is waiting for, and how much of it there is.",
        "Plants run only on power that nothing else uses and the battery banks can't store: in Daylight, once the battery banks are full. They stand idle all Night, with any batch they have started kept for the next Daylight, so keep enough oxygen and water in stock to last it; the status panel says when a stock won't.",
        "Switch a Plant off in the Base panel to keep an input it would use, or to leave its power to other Plants, and switch it on again whenever you like: neither needs the Robot. A batch it has started finishes first. The forecasts count a switched-off Plant as making nothing. It wears no further by Dust while it stands idle, but Micrometeorites can still strike it and the Robot still maintains it.",
        `A Light Mast only helps you see, as work carries on in the dark. At Night it switches itself off to save power once the battery banks hold only enough for everything else through to Daylight and ${formatHours(lightReserveHours)} more.`,
      ],
    },
    {
      title: "Repairs and Maintenance",
      paragraphs: [
        `You never repair anything yourself: the Robot does it. Dust, the cold of Night, Micrometeorites and the Lander's Plume Ejecta wear everything down, and below ${catalogue.structurePerformance.thresholdPercent}% Condition a thing works less well.`,
        `Once a Structure, Machine or Rover is below ${maintenance.thresholdPercent}% Condition, or Broken, the Robot repairs it by itself, ahead of other work: it collects spare Components at the stockpile and brings it back to 100%, using one for every ${maintenance.conditionPercentPerSpareComponent} percentage points. A Robot below ${robot.selfRepairThresholdPercent}% repairs itself where the Mission Director lives.`,
        "Without enough spare Components, Maintenance waits, so keep them coming on the Launch manifest; the status panel shows how long they will last. The Robot cleans Dust off solar arrays the same way, with no spares.",
      ],
    },
    {
      title: "Keeping the Mission Director alive",
      paragraphs: [
        `The Mission Director starts safe aboard the Lander. Once they move into a Habitat, they use ${listInWords(catalogue.lifeSupportStocks.map((stock) => stockLabel(stock.id).toLowerCase()))} every Earth Day and absorb a Radiation Dose. Running out of either, the Habitat losing power or the dose reaching ${radiation.doseLimitMillisieverts} mSv kills them at once.`,
        "Regolith shielding over the Habitat, and later a water wall over that, cuts the dose. Launches bring oxygen and water until the base's Plants and Expeditions make enough.",
      ],
    },
    {
      title: "Launches and Funding",
      paragraphs: [
        `The Lander can fly to Earth and back once the Mission Director has moved into a Habitat. Each Launch costs a ${formatMillionDollars(launch.feeMillionDollars)} fee plus the price of what it brings, up to ${launch.payloadMassLimitKilograms} kg; choose it on the Launch manifest.`,
        `Funding starts with the ${formatMillionDollars(catalogue.programmeGrantMillionDollars)} Programme Grant. Exports, such as wafers and circuit boards, earn more: load them on the Launch manifest's Exports tab, and they sell as the Lander reaches Earth, before the next Launch is paid for. What the Exports aboard and to load will sell for counts towards what it can cost, so the Lander can't leave if they fall short of it. A landing pad stops it blasting Plume Ejecta over the base.`,
      ],
    },
    {
      title: "Science and technologies",
      paragraphs: [
        "Research Tasks run by themselves and earn Science, which unlocks Designs on the Tech Tree. Unlocking a Design only permits what it covers: its Structures still have to be built, and their Components shipped.",
        "The Technologies tab lists every Design and what unlocking it brings.",
      ],
    },
  ];
}
