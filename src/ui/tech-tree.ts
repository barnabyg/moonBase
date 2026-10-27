import { catalogue, type Design } from "../catalogue";
import {
  designLabel,
  type Campaign,
  type DesignUnlockedEvent,
  type Snapshot,
} from "../simulation";
import { setText } from "./dom";
import { describeDesignState, formatScience } from "./format";
import { createScreen } from "./screen";

export interface TechTreeScreen {
  open(): void;
  update(snapshot: Snapshot): void;
}

/**
 * The Tech Tree screen, where the player spends Science to unlock a Design.
 * A tab for each category shows its Designs as cards, in columns by how far
 * along the tree each is: the starting ones first, then each one after all
 * the Designs it needs first. A card has its cost, the Designs it needs
 * first and whether it is unlocked, can be unlocked now or is out of reach,
 * and why. The screen only sends the choice to unlock one to the Campaign,
 * which decides whether it is allowed and says why not, and passes on the
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
    "Unlocking a Design permits what it covers, but adds nothing to the base: it still has to be shipped or built.";

  const tiers = designTiers();
  const shown = catalogue.designCategories
    .map((category) => ({
      ...category,
      designs: catalogue.designs.filter(
        (design) => design.category === category.id,
      ),
    }))
    .filter((category) => category.designs.length > 0);
  const tabs = screen.addTabs("Categories", shown);
  const categories = shown.map((category, index) => {
    const { tab, panel } = tabs[index] ?? {};
    if (tab === undefined || panel === undefined) {
      throw new Error(`No tab for ${category.label}`);
    }
    // How many are unlocked, and a mark when one can be now.
    const tally = document.createElement("span");
    tally.className = "tech-tree__tally";
    tab.append(tally);
    panel.className = "tech-tree__panel";
    const columns = new Map<number, HTMLElement>();
    for (const tier of [
      ...new Set(category.designs.map((d) => tiers.get(d.id) ?? 0)),
    ].sort((a, b) => a - b)) {
      const column = document.createElement("div");
      column.className = "tech-tree__column";
      const heading = document.createElement("h3");
      heading.className = "screen__section-title";
      heading.textContent = tier === 0 ? "Starting" : `Tier ${tier}`;
      column.append(heading);
      columns.set(tier, column);
      panel.append(column);
    }
    return { ...category, tab, tally, columns };
  });

  const cards = categories.flatMap((category) =>
    category.designs.map((design) => {
      const card = createCard(design, category.id, (message) => {
        screen.refuse(message);
      });
      category.columns.get(tiers.get(design.id) ?? 0)?.append(card.element);
      return card;
    }),
  );

  function createCard(
    design: Design,
    categoryId: string,
    refuse: (message: string | undefined) => void,
  ) {
    const element = document.createElement("article");
    element.className = "design-card";
    element.setAttribute("aria-label", design.label);
    const top = document.createElement("div");
    top.className = "design-card__top";
    const name = document.createElement("h4");
    name.className = "design-card__name";
    name.textContent = design.label;
    const cost = document.createElement("span");
    cost.className = design.starting ? "chip" : "chip chip--science";
    cost.textContent = design.starting
      ? "Starting"
      : formatScience(design.scienceCost);
    top.append(name, cost);
    const description = document.createElement("p");
    description.className = "design-card__description";
    description.textContent = design.description;
    element.append(top, description);

    // Each Design it needs first, marked once it is unlocked.
    const needs = design.prerequisiteDesignIds.map((id) => {
      const chip = document.createElement("span");
      chip.className = "chip design-card__need";
      const prerequisite = catalogue.designs.find((d) => d.id === id);
      const elsewhere =
        prerequisite !== undefined && prerequisite.category !== categoryId
          ? catalogue.designCategories.find(
              (category) => category.id === prerequisite.category,
            )?.label
          : undefined;
      chip.textContent =
        elsewhere === undefined
          ? designLabel(id)
          : `${designLabel(id)} (${elsewhere})`;
      return { id, chip };
    });
    if (needs.length > 0) {
      const line = document.createElement("p");
      line.className = "design-card__needs";
      const label = document.createElement("span");
      label.className = "design-card__needs-label";
      label.textContent = "Needs";
      line.append(label, ...needs.map(({ chip }) => chip));
      element.append(line);
    }

    const foot = document.createElement("div");
    foot.className = "design-card__foot";
    // Whether it is unlocked, can be now, or why not.
    const state = document.createElement("span");
    const unlock = document.createElement("button");
    unlock.type = "button";
    unlock.className = "screen__button";
    unlock.textContent = "Unlock";
    unlock.setAttribute("aria-label", `Unlock ${design.label}`);
    unlock.addEventListener("click", () => {
      const result = campaign.unlockDesign(design.id);
      refuse(result.ok ? undefined : result.message);
      if (result.ok) onUnlocked(result.event);
    });
    foot.append(state, unlock);
    element.append(foot);

    return {
      design,
      element,
      update(snapshot: Snapshot) {
        const described = describeDesignState(design, snapshot);
        setText(
          state,
          described.state === "unlocked" ? "✓ Unlocked" : described.text,
        );
        state.className = `design-card__state design-card__state--${described.state}`;
        element.dataset["state"] = described.state;
        for (const { id, chip } of needs) {
          chip.classList.toggle(
            "chip--met",
            snapshot.unlockedDesignIds.includes(id),
          );
        }
        // One out of reach keeps its button, so that unlocking it says why
        // it can't; only one that can be unlocked now stands out.
        unlock.hidden = described.state === "unlocked";
        unlock.classList.toggle(
          "screen__button--primary",
          described.state === "unlockable",
        );
        return described.state;
      },
    };
  }

  return {
    open() {
      screen.open();
    },
    update(snapshot) {
      setText(screen.figure, `${formatScience(snapshot.science)} to spend`);
      const states = new Map(
        cards.map((card) => [card.design.id, card.update(snapshot)]),
      );
      for (const category of categories) {
        const unlocked = category.designs.filter(
          (design) => states.get(design.id) === "unlocked",
        ).length;
        const unlockable = category.designs.some(
          (design) => states.get(design.id) === "unlockable",
        );
        const tally = `${unlocked}/${category.designs.length}`;
        setText(category.tally, tally);
        category.tab.classList.toggle("tech-tree__tab--ready", unlockable);
        // Its name, then the tally and the mark in words.
        const name = `${category.label}, ${unlocked} of ${category.designs.length} unlocked${unlockable ? ", a Design can be unlocked now" : ""}`;
        if (category.tab.getAttribute("aria-label") !== name) {
          category.tab.setAttribute("aria-label", name);
          category.tab.title = name;
        }
      }
    },
  };
}

/**
 * How far along the tree each Design is: 0 for a starting one, and for any
 * other one more than the furthest along of the Designs it needs first.
 */
function designTiers(): Map<string, number> {
  const tiers = new Map<string, number>();
  function tierOf(design: Design): number {
    const known = tiers.get(design.id);
    if (known !== undefined) return known;
    const tier = design.starting
      ? 0
      : 1 +
        Math.max(
          0,
          ...design.prerequisiteDesignIds.map((id) => {
            const prerequisite = catalogue.designs.find((d) => d.id === id);
            return prerequisite === undefined ? 0 : tierOf(prerequisite);
          }),
        );
    tiers.set(design.id, tier);
    return tier;
  }
  for (const design of catalogue.designs) tierOf(design);
  return tiers;
}
