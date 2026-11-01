import type { ComponentType, LaunchItem, StructureType } from "./types";

// Every kind of solar array, made from one table of what its parts do. The
// player only ever plans a solar array: which of these it turns out to be
// comes from the parts it is built from (see
// src/simulation/solar-arrays.ts). So the upgrades add up, and nothing that
// already exists changes when a Design is unlocked: an array stays as it was
// built, and a part stays as it was made, however good the parts on sale now.

const SOLAR_ARRAYS = "solar-arrays";
const SEALED = "dust-sealed-solar-arrays";
const SCREENS = "electrodynamic-dust-screens";
const THIN_FILM = "thin-film-solar-cells";
const PREFABRICATED = "prefabricated-solar-arrays";

interface Mast {
  readonly componentId: string;
  readonly label: string;
  readonly sealed: boolean;
  readonly massKilograms: number;
  readonly priceMillionDollars: number;
}

interface Panel {
  readonly componentId: string;
  readonly label: string;
  readonly screened: boolean;
  readonly thinFilm: boolean;
  readonly massKilograms: number;
  readonly priceMillionDollars: number;
}

const MASTS: readonly Mast[] = [
  {
    componentId: "array-mast",
    label: "Array mast",
    sealed: false,
    massKilograms: 80,
    priceMillionDollars: 3,
  },
  // Heavier and dearer than an array mast for its seals.
  {
    componentId: "sealed-array-mast",
    label: "Sealed array mast",
    sealed: true,
    massKilograms: 100,
    priceMillionDollars: 6,
  },
];

const PANELS: readonly Panel[] = [
  {
    componentId: "solar-panel",
    label: "Solar panel",
    screened: false,
    thinFilm: false,
    massKilograms: 60,
    priceMillionDollars: 4,
  },
  // The electrodes woven through the cells add mass and price.
  {
    componentId: "screened-solar-panel",
    label: "Screened solar panel",
    screened: true,
    thinFilm: false,
    massKilograms: 70,
    priceMillionDollars: 8,
  },
  // Two of them and an array mast come to 150 kg, for half as much power again.
  {
    componentId: "thin-film-solar-panel",
    label: "Thin-film solar panel",
    screened: false,
    thinFilm: true,
    massKilograms: 35,
    priceMillionDollars: 7,
  },
  // A thin-film panel with the same electrodes, at what they add to any panel.
  {
    componentId: "screened-thin-film-solar-panel",
    label: "Screened thin-film solar panel",
    screened: true,
    thinFilm: true,
    massKilograms: 45,
    priceMillionDollars: 11,
  },
];

// What being put together and tested on Earth adds to the parts it is made of.
const PACK_MASS_KILOGRAMS = 30;
const PACK_PRICE_MILLION_DOLLARS = 3;

/** A whole solar array, folded on its mast on a skid, can be had only with the best parts of its day. */
function hasPack(mast: Mast, panel: Panel): boolean {
  // Screens come after sealing in the Tech Tree, so none is made without it.
  return mast.sealed || !panel.screened;
}

function packId(mast: Mast, panel: Panel): string {
  return `prefabricated-${words(mast, panel, "-")}array-pack`;
}

/** What its parts make of an array, for its id and its label: "dust-sealed thin-film ". */
function words(mast: Mast, panel: Panel, between: string): string {
  const dust =
    mast.sealed && panel.screened
      ? "dust-screened"
      : mast.sealed
        ? "dust-sealed"
        : panel.screened
          ? "screened"
          : "";
  return [dust, panel.thinFilm ? "thin-film" : ""]
    .filter((word) => word !== "")
    .map((word) => `${word}${between}`)
    .join("");
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function designOf(mast: Mast, panel: Panel, prefabricated: boolean): string {
  if (prefabricated) return PREFABRICATED;
  if (panel.screened) return SCREENS;
  if (panel.thinFilm) return THIN_FILM;
  return mast.sealed ? SEALED : SOLAR_ARRAYS;
}

function arrayType(
  mast: Mast,
  panel: Panel,
  prefabricated: boolean,
): StructureType {
  const made = words(mast, panel, " ");
  return {
    id: `${prefabricated ? "prefabricated-" : ""}${words(mast, panel, "-")}solar-array`,
    label: capitalised(
      `${prefabricated ? "prefabricated " : ""}${made}solar array`,
    ),
    designId: designOf(mast, panel, prefabricated),
    solarArray: {
      sealed: mast.sealed,
      screened: panel.screened,
      thinFilm: panel.thinFilm,
      prefabricated,
    },
    footprintRadiusMetres: 3,
    components: prefabricated
      ? [{ componentId: packId(mast, panel), count: 1 }]
      : [
          { componentId: panel.componentId, count: 2 },
          { componentId: mast.componentId, count: 1 },
        ],
    // Standing on less grading, it only has to be unfolded.
    stageHours: prefabricated
      ? {
          sitePreparation: 1,
          componentDelivery: 0.5,
          assembly: 1,
          commissioning: 0.5,
        }
      : {
          sitePreparation: 2,
          componentDelivery: 1,
          assembly: 3,
          commissioning: 1,
        },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: prefabricated ? 0.1 : 0.25,
    // Its tracking drive and panel hinges grind on the Dust, unless sealed
    // in a sealed array mast.
    dustWearPercentPerHour: mast.sealed ? 0.02 : 0.05,
    // A dust screen pushes Dust off the cells: past the cleaning threshold in
    // some four Lunations' Daylight rather than one.
    hazardMultipliers: {
      dustCoating: panel.screened ? 0.25 : 1,
      micrometeorites: 1,
      plumeEjecta: 1,
    },
    // The drive that keeps the panel turned to the sun.
    power: {
      generationKilowatts: panel.thinFilm ? 15 : 10,
      storageKilowattHours: 0,
      drawKilowatts: 0.05,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  };
}

const combinations = MASTS.flatMap((mast) =>
  PANELS.map((panel) => ({ mast, panel })),
);
const packs = combinations.filter(({ mast, panel }) => hasPack(mast, panel));

/**
 * Every kind of solar array, the plain one first and each after it no worse
 * for a part of the same kind, so that later is better among equals.
 */
export const solarArrayTypes: readonly StructureType[] = [
  ...combinations.map(({ mast, panel }) => arrayType(mast, panel, false)),
  ...packs.map(({ mast, panel }) => arrayType(mast, panel, true)),
];

/** The Components of solar arrays that only their later Designs need. */
export const solarArrayPartTypes: readonly ComponentType[] = [
  {
    id: "screened-thin-film-solar-panel",
    label: "Screened thin-film solar panel",
  },
  ...packs
    .filter(
      ({ mast, panel }) => mast.sealed || panel.screened || panel.thinFilm,
    )
    .map(({ mast, panel }) => ({
      id: packId(mast, panel),
      label: capitalised(`prefabricated ${words(mast, panel, " ")}array pack`),
    })),
];

/** Which Designs a part needs, and which put it out of production. */
function offered(
  needs: readonly string[],
  withoutThese: readonly string[],
): Pick<LaunchItem, "designId" | "alsoNeedsDesignIds" | "retiredByDesignIds"> {
  const [designId = SOLAR_ARRAYS, ...others] = needs;
  return {
    designId,
    alsoNeedsDesignIds: others,
    retiredByDesignIds: withoutThese,
  };
}

function panelItem(panel: Panel): LaunchItem {
  const designs = [
    ...(panel.screened ? [SCREENS] : []),
    ...(panel.thinFilm ? [THIN_FILM] : []),
  ];
  return {
    id: panel.componentId,
    ...offered(designs.length === 0 ? [SOLAR_ARRAYS] : designs, [
      PREFABRICATED,
      ...(panel.screened ? [] : [SCREENS]),
      ...(panel.thinFilm ? [] : [THIN_FILM]),
    ]),
    brings: { kind: "component", componentId: panel.componentId },
    massKilograms: panel.massKilograms,
    priceMillionDollars: panel.priceMillionDollars,
  };
}

function mastItem(mast: Mast): LaunchItem {
  return {
    id: mast.componentId,
    ...offered(
      [mast.sealed ? SEALED : SOLAR_ARRAYS],
      [PREFABRICATED, ...(mast.sealed ? [] : [SEALED])],
    ),
    brings: { kind: "component", componentId: mast.componentId },
    massKilograms: mast.massKilograms,
    priceMillionDollars: mast.priceMillionDollars,
  };
}

function packItem(mast: Mast, panel: Panel): LaunchItem {
  const id = packId(mast, panel);
  return {
    id,
    ...offered(
      [
        PREFABRICATED,
        ...(mast.sealed ? [SEALED] : []),
        ...(panel.screened ? [SCREENS] : []),
        ...(panel.thinFilm ? [THIN_FILM] : []),
      ],
      [
        ...(mast.sealed ? [] : [SEALED]),
        ...(panel.screened ? [] : [SCREENS]),
        ...(panel.thinFilm ? [] : [THIN_FILM]),
      ],
    ),
    brings: { kind: "component", componentId: id },
    massKilograms:
      mast.massKilograms + 2 * panel.massKilograms + PACK_MASS_KILOGRAMS,
    priceMillionDollars:
      mast.priceMillionDollars +
      2 * panel.priceMillionDollars +
      PACK_PRICE_MILLION_DOLLARS,
  };
}

/**
 * What a Launch can bring of solar arrays. At any time exactly one mast and
 * one panel are on sale, or one pack once arrays are prefabricated: the best
 * the unlocked Designs allow.
 */
export const solarArrayLaunchItems: readonly LaunchItem[] = [
  ...PANELS.map(panelItem),
  ...MASTS.map(mastItem),
  ...packs.map(({ mast, panel }) => packItem(mast, panel)),
];

function sentences(...texts: readonly string[]): string {
  return texts.filter((text) => text !== "").join(" ");
}

/** What a part brings to the array it is built into, in words, by Component. */
export const solarArrayPartEffects: Readonly<Record<string, string>> = {
  "sealed-array-mast":
    "Sealed against Dust, so the array wears down more slowly.",
  ...Object.fromEntries(
    PANELS.filter((panel) => panel.screened || panel.thinFilm).map(
      (panel): [string, string] => [
        panel.componentId,
        sentences(
          panel.thinFilm ? "Generates 15 kW an array, not 10." : "",
          panel.screened ? "Dust coats it far more slowly." : "",
        ),
      ],
    ),
  ),
  ...Object.fromEntries(
    packs.map(({ mast, panel }): [string, string] => [
      packId(mast, panel),
      sentences(
        "A whole array in one piece, which goes up in under half the hours.",
        mast.sealed ? "Sealed against Dust." : "",
        panel.screened ? "Dust screened." : "",
        panel.thinFilm ? "Thin-film, for 15 kW." : "",
      ),
    ]),
  ),
};
