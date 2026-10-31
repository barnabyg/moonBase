import { resourceOutputs } from "../src/catalogue";
import { beatenDesigns, offerings, type PacedCatalogue } from "./pacing-report";

// Rules that keep the data catalogue's content consistent as it grows, so that
// a bad addition fails with a clear reason and nobody has to replay the game
// to find it. `catalogue-rules.test.ts` holds the real catalogue to them. See
// docs/balancing.md.

/** Something in the catalogue that breaks a rule. */
export interface Breach {
  readonly rule: RuleId;
  /** The id of what breaks it. */
  readonly item: string;
  /** Names the item and the rule, and says what is wrong. */
  readonly message: string;
}

export type RuleId =
  | "design-has-a-purpose"
  | "design-not-beaten"
  | "export-can-be-sold"
  | "bulk-resource-has-a-use";

/** Something agreed to break a rule, and why. */
export interface Exemption {
  readonly rule: RuleId;
  readonly item: string;
  readonly reason: string;
}

/**
 * Where today's catalogue breaks a rule. Each is a decision: changing the
 * balance to meet the rule, or having the long-game play guide use the Design,
 * takes it off this list.
 */
export const exemptions: readonly Exemption[] = [
  {
    rule: "design-has-a-purpose",
    item: "water-electrolysis",
    reason:
      "Makes oxygen from water rather than from Regolith, a real choice the rule can't see, as the extraction plant also makes metals and silicon, so the two don't count as the same job. The long game runs the extraction plant instead.",
  },
  {
    rule: "design-has-a-purpose",
    item: "optical-telescopes",
    reason:
      "Earns a little Science at Night, on top of the Research Tasks, for a player who keeps power in hand. The long game gets through the Tech Tree without one; docs/balancing.md explains why it adds to research rather than replacing it.",
  },
  {
    rule: "design-has-a-purpose",
    item: "parking-areas",
    reason:
      "Keeps idle Machines and Rovers tidy and off the Habitat's network at Night. It is a convenience the long game doesn't need, as the Robot otherwise parks them beside the nearest powered Structure.",
  },
  {
    rule: "design-has-a-purpose",
    item: "robots",
    reason:
      "A second Robot speeds up every Work Order rather than doing a job of its own. The long game gets by with the one it lands with, to keep its play the same as the reference Campaign's.",
  },
];

function breach(rule: RuleId, item: string, problem: string): Breach {
  return { rule, item, message: `${rule}: ${item} ${problem}` };
}

/**
 * Every Design brings something the long-game play guide uses or that offers a
 * choice: a job something from another Design does too.
 */
function designsWithoutAPurpose(
  catalogue: PacedCatalogue,
  designsUsed: readonly string[],
): Breach[] {
  const all = offerings(catalogue);
  return catalogue.designs
    .filter((design) => {
      if (designsUsed.includes(design.id)) return false;
      return !all.some(
        (offering) =>
          offering.designId === design.id &&
          all.some(
            (other) =>
              other.designId !== design.id && other.job === offering.job,
          ),
      );
    })
    .map((design) =>
      breach(
        "design-has-a-purpose",
        design.id,
        "brings nothing the long-game play guide uses, and offers no choice: nothing from another Design does the same job.",
      ),
    );
}

/** No Design is beaten outright by something at least as cheap. */
function designsBeaten(catalogue: PacedCatalogue): Breach[] {
  return beatenDesigns(catalogue).map(({ designId, beaten }) =>
    breach(
      "design-not-beaten",
      designId,
      `is beaten outright: ${beaten.map(({ thing, by }) => `${by} is at least as cheap and as good as ${thing}`).join("; ")}.`,
    ),
  );
}

/** Every Export can be made by some Plant, and sold within the Return Mass. */
function exportsThatCantBeSold(catalogue: PacedCatalogue): Breach[] {
  return catalogue.exports.flatMap(
    ({ resourceId, priceMillionDollarsPerKilogram }) => {
      const made = catalogue.structureTypes.some((type) =>
        type.recipes?.some((recipe) =>
          resourceOutputs(recipe).some(
            (output) =>
              output.resource.kind === "bulk-resource" &&
              output.resource.resourceId === resourceId,
          ),
        ),
      );
      const problems = [
        ...(made ? [] : ["no Plant makes it"]),
        ...(catalogue.lander.returnMassKilograms > 0
          ? []
          : ["the Lander has no Return Mass to carry it"]),
        ...(priceMillionDollarsPerKilogram > 0
          ? []
          : ["a full Return Mass of it sells for nothing"]),
      ];
      return problems.length > 0
        ? [
            breach(
              "export-can-be-sold",
              resourceId,
              `can't be sold: ${problems.join(", and ")}.`,
            ),
          ]
        : [];
    },
  );
}

/** Every bulk resource goes into some Plant, or is sold. */
function bulkResourcesWithoutAUse(catalogue: PacedCatalogue): Breach[] {
  return catalogue.bulkResources
    .filter(
      ({ id }) =>
        !catalogue.exports.some((sold) => sold.resourceId === id) &&
        !catalogue.structureTypes.some((type) =>
          type.recipes?.some((recipe) =>
            recipe.inputs.some(
              (input) =>
                input.resource.kind === "bulk-resource" &&
                input.resource.resourceId === id,
            ),
          ),
        ),
    )
    .map(({ id }) =>
      breach(
        "bulk-resource-has-a-use",
        id,
        "has no use: no Plant takes it in, and it isn't an Export.",
      ),
    );
}

/** Everything in a catalogue that breaks a rule, exempt or not. */
export function breaches(
  catalogue: PacedCatalogue,
  designsUsed: readonly string[],
): Breach[] {
  return [
    ...designsWithoutAPurpose(catalogue, designsUsed),
    ...designsBeaten(catalogue),
    ...exportsThatCantBeSold(catalogue),
    ...bulkResourcesWithoutAUse(catalogue),
  ];
}

/**
 * What is wrong with a catalogue given its exemptions, as messages: each
 * breach with no exemption, and each exemption that no longer excuses a
 * breach, so that the list can't go stale.
 */
export function ruleFailures(
  catalogue: PacedCatalogue,
  designsUsed: readonly string[],
  agreed: readonly Exemption[],
): string[] {
  const found = breaches(catalogue, designsUsed);
  return [
    ...found
      .filter(
        ({ rule, item }) =>
          !agreed.some(
            (exemption) => exemption.rule === rule && exemption.item === item,
          ),
      )
      .map(({ message }) => message),
    ...agreed
      .filter(
        ({ rule, item }) =>
          !found.some((entry) => entry.rule === rule && entry.item === item),
      )
      .map(
        ({ rule, item }) =>
          `${rule}: ${item} is on the exemption list, but no longer breaks the rule. Take it off.`,
      ),
  ];
}
