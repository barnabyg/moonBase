import { catalogue } from "../catalogue";
import { designLabel, reserveKilograms, type Snapshot } from "../simulation";
import {
  describeBuild,
  describeComponentUse,
  describeStructure,
  describeUnlocks,
  designOf,
  formatHours,
} from "./describe";
import { setText } from "./dom";
import { formatMillionDollars, formatScience, listInWords } from "./format";
import { stockLabel } from "./labels";
import { formatLaunchItem } from "./launch-manifest-text";
import { describeDesignState } from "./tech-tree-text";
import { createScreen } from "./screen";

export interface GuideScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/** What the Guide says of the limit on propellant, from the data catalogue's figures. */
function propellantStorage(): string[] {
  const holds = catalogue.structureTypes.find(
    ({ ownStorage }) => ownStorage !== undefined,
  )?.ownStorage;
  const tank = catalogue.structureTypes.find(
    ({ storageTank }) => storageTank?.resource.kind === "bulk-resource",
  )?.storageTank;
  if (holds === undefined || tank === undefined) return [];
  return [
    `Propellant has a limit as well: a propellant plant of either size holds ${holds.kilograms} kg, and a propellant tank (the Propellant production Design) adds ${tank.kilograms} kg. A Plant with no room waits for tank space, and the status panel says it is holding full. Nobody depends on it, so no reserve is kept: a Broken tank's share goes at once and a tank with no power at Night goes on losing its share, however little is left. A Plant that is Broken or taken apart only lowers the limit: what the base has stays, and can be burned or sold, though no more is made until it fits.`,
  ];
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
    nightReserveHours,
    observingProgramme,
  } = catalogue;
  return [
    {
      title: "Your job",
      paragraphs: [
        "You are the Mission Director. You decide what to build and what each Launch brings from Earth; the Robot does all the work by itself.",
        "Pick a Structure in the build menu and click the map to plan it. The Robot fetches its Components from the stockpile, a Machine prepares the site, and the Robot assembles it, lays it a power cable and commissions it. The Work panel shows what it is doing.",
        "Click a Structure on the map, built or not, to see what it is doing in a pop-up beside it, with the same choices as the Base panel. Click empty ground or press Esc to close it; dragging moves the camera instead.",
        "The Milestones at the top of the status panel say what to do next. Click a section's title to fold it away: its headline figures stay beside the title.",
      ],
    },
    {
      title: "Power and Night",
      paragraphs: [
        `A Lunation is ${lunation.daylightEarthDays} Earth Days of Daylight and ${lunation.nightEarthDays} of Night. Solar arrays generate only in Daylight; battery banks store the surplus and carry the base through the Night. Only Structures joined by cable share power.`,
        "The Habitat is supplied first. If it loses power with the Mission Director inside, they die, so build enough battery banks before Night falls: the status panel shows how long the stored power will last.",
        `Machines and the Rover parked within ${cold.plugInReachMetres} m of a powered Structure draw power for their heaters at Night, and the Robot parks them before Night falls; left in the cold, they wear down.`,
        `Build a parking area to keep them together: before Night falls the Robot parks them in its bays, even those already plugged in elsewhere, rather than beside the nearest powered Structure, as long as it has a bay free, is cabled to battery banks that will keep their heaters on through the Night, and is no more than ${cold.bayDetourMetres} m further off than that Structure. Put it near where the Machines work, as the Robot drives them there and back.`,
        "Plants work in batches of their recipe, most of them an hour long: each starts once there is a batch's worth of every input in stock, and its outputs come as it finishes. The Base panel says what each is waiting for, and how much of it there is.",
        `Plants run only on power that nothing else needs: in Daylight, once the battery banks are full, and at Night while the battery banks hold more than everything else needs through to Daylight and ${formatHours(nightReserveHours)} more. Build more battery banks to keep them running into the Night. Once there is none to spare they stand idle, with any batch they have started kept for later, so keep enough oxygen and water in stock to last the Night; the status panel says when a stock won't.`,
        ...catalogue.lifeSupportStocks
          .filter((stock) => stock.id === "water")
          .map(
            (water) =>
              `An optics works and a grinding line use water as coolant, the Mission Director's water, so it has to come from somewhere: Launches, or ice turned into water. They start no batch that would take it below a reserve kept for the Mission Director, ${water.reserveEarthDays} Earth Days of what they use (${reserveKilograms(water.id)} kg): the Base panel then says the Plant is waiting, and the status panel says what is using the water and what is waiting. So they can never drink it all, and what they use doesn't count against being self-sufficient in water, which judges only what the Mission Director uses.`,
          ),
        `The base's own tanks hold ${listInWords(
          catalogue.lifeSupportStocks.map(
            (stock) =>
              `${stock.storageLimitKilograms} kg of ${stock.label.toLowerCase()}`,
          ),
        )}, and the status panel shows each stock against its limit. A Plant that makes only a full stock waits for tank space, using no power or inputs, and starts again as the Mission Director uses some: the status panel says the stock is holding full, and that doesn't count against being self-sufficient in it. A Plant that makes other things as well keeps running and loses what doesn't fit, so that oxygen can't hold up metals. The Launch manifest warns if a Launch would bring more than there is room for: what doesn't fit is lost on landing.`,
        `A storage tank (the Bulk supply tanks Design) raises a stock's limit once it is commissioned. It comes empty and takes a cable, as it draws a little power all through the Night to stop what it holds freezing or boiling off. Every tank, and the base's own, holds its share of the stock. A Broken tank loses its share at once and the limit falls until it is repaired, a tank taken apart loses whatever no longer fits, and with no power at Night a tank loses a little of its share every hour. None of that takes the stock below the Mission Director's reserve.`,
        ...propellantStorage(),
        "Switch a Plant off in the Base panel to keep an input it would use, or to leave its power to other Plants, and switch it on again whenever you like: neither needs the Robot. A batch it has started finishes first. The forecasts count a switched-off Plant as making nothing. It wears no further by Dust while it stands idle, but Micrometeorites can still strike it and the Robot still maintains it.",
        `A Light Mast only helps you see, as work carries on in the dark. At Night it switches itself off to save power once the battery banks hold only enough for everything else through to Daylight and ${formatHours(nightReserveHours)} more.`,
      ],
    },
    {
      title: "Repairs and Maintenance",
      paragraphs: [
        `You never repair anything yourself: the Robot does it. Dust, the cold of Night, Micrometeorites and the Lander's Plume Ejecta wear everything down, and below ${catalogue.structurePerformance.thresholdPercent}% Condition a thing works less well.`,
        `Once a Structure, Machine or Rover is below ${maintenance.thresholdPercent}% Condition, or Broken, the Robot repairs it by itself, ahead of other work: it collects spare Components at the stockpile and brings it back to 100%, using one for every ${maintenance.conditionPercentPerSpareComponent} percentage points. A Robot below ${robot.selfRepairThresholdPercent}% repairs itself where the Mission Director lives.`,
        "Without enough spare Components, Maintenance waits, so keep them coming on the Launch manifest, or make them from metals in a Workshop, once you have its Design; the status panel shows how long they will last, or that they are rising, and beside Self-sufficient whether the base makes as many as it uses. The Robot cleans Dust off solar arrays the same way, with no spares.",
      ],
    },
    {
      title: "Keeping the Mission Director alive",
      paragraphs: [
        `The Mission Director starts safe aboard the Lander. Once they move into a Habitat, they use ${listInWords(catalogue.lifeSupportStocks.map((stock) => stockLabel(stock.id).toLowerCase()))} every Earth Day and absorb a Radiation Dose. Running out of either, the Habitat losing power or the dose reaching ${radiation.doseLimitMillisieverts} mSv kills them at once.`,
        "Regolith shielding over the Habitat, and later a water wall over that, cuts the dose. Launches bring oxygen and water until the base's Plants and Expeditions make enough.",
        `The dose never falls, and even behind a water wall it reaches the limit in time. A Buried Habitat cuts its rate to ${radiation.doseRateMillisievertsPerEarthDay.buriedHabitat} mSv an Earth Day, a tenth of a water wall's: its kit takes several Launches and a great deal of Funding, so plan for it long before the limit, and the sooner the Habitat over it was shielded, the more of the dose is left. Press "Move here" beside any other commissioned Habitat with power to move the Mission Director, at once. You can then have the old Habitat dismantled, its shielding first, to get its power back. A Broken Buried Habitat protects nobody, and any Habitat they live in that Breaks or loses power kills them.`,
      ],
    },
    {
      title: "Launches and Funding",
      paragraphs: [
        `The Lander can fly to Earth and back once the Mission Director has moved into a Habitat. Each Launch costs a ${formatMillionDollars(launch.feeMillionDollars)} fee plus the price of what it brings, up to ${launch.payloadMassLimitKilograms} kg; choose it on the Launch manifest.`,
        `Funding starts with the ${formatMillionDollars(catalogue.programmeGrantMillionDollars)} Programme Grant. Exports, such as wafers, circuit boards, metals, propellant and precision optics, earn more: load them on the Launch manifest's Exports tab, and they sell as the Lander reaches Earth, before the next Launch is paid for. What the Exports aboard and to load will sell for counts towards what it can cost, so the Lander can't leave if they fall short of it. A landing pad stops it blasting Plume Ejecta over the base.`,
      ],
    },
    {
      title: "Science and technologies",
      paragraphs: [
        "Research Tasks run by themselves and earn Science, which unlocks Designs on the Tech Tree. Unlocking a Design only permits what it covers: its Structures still have to be built, and their Components shipped.",
        `A telescope works on the ${observingProgramme.label}, a standing Research Task that runs alongside the one you start and never ends. It observes only at Night, while it has power and isn't Broken, and every ${formatHours(observingProgramme.lengthHours)} of observing completes a round for ${formatScience(observingProgramme.science)}; more telescopes get through a round faster. It draws power only while it observes, and, like a Light Mast, stops to save power once the battery banks hold only enough for everything else through to Daylight and ${formatHours(nightReserveHours)} more, so build battery banks enough for it. The Research section of the status panel shows how the ${observingProgramme.label} is going.`,
        ...catalogue.structureTypes.flatMap(
          ({ growing, label, power, recipes }) =>
            growing === undefined
              ? []
              : [
                  `A ${label} (the Lunar greenhouses Design) earns ${formatScience(growing.science)} for every ${formatHours(growing.lengthHours)} it grows, Daylight and Night alike, and each has its own round, so more earn more. It drinks ${recipes?.[0]?.inputs[0]?.kilogramsPerHour ?? 0} kg of water an hour and draws ${power.daylightDrawKilowatts ?? 0} kW by day and ${power.nightDrawKilowatts} kW at Night, when Plants that make water may stand idle: store enough to last the Night, as a shortage of water or power loses what it has grown of its round. It never takes water below the reserve, and gives up its lamps before anything else goes without power, so it can't kill the Mission Director. It starts a new round by itself once it is supplied, and switching it off gives up the round.`,
                ],
        ),
        "The Technologies tab lists every Design and what unlocking it brings.",
      ],
    },
  ];
}
