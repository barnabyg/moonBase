import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import { isDueToBeDismantled } from "./dismantling";
import type { GameEvent } from "./events";
import { sellExports, takeExportsAboard } from "./exports";
import { deliverLaunch, payForLaunch } from "./launch-manifest";
import { blastPlumeEjecta } from "./plume-ejecta";

/** The legs of the Lander's round trip, in the order it flies them. */
export type LanderLeg =
  "travelling-to-earth" | "turnaround" | "travelling-to-moon";

/** The leg of its round trip the Lander is on, and when the leg began and ends. */
export interface LanderTrip {
  leg: LanderLeg;
  /** The game-minute the leg began, counted from the start of the Campaign. */
  legStartedAtMinute: number;
  legEndsAtMinute: number;
}

export interface LanderState {
  /** Where it stands, or stood before it took off. */
  position: GroundPosition;
  /** The round trip it is on, or undefined while it is landed. */
  trip: LanderTrip | undefined;
  /**
   * The Components aboard it, which the Robot has yet to carry to the
   * stockpile: only ever after it has landed on a landing pad.
   */
  cargo: ComponentCount[];
  /**
   * The Exports aboard it, in catalogue order: from its take-off until they
   * are sold as it reaches Earth.
   */
  exports: { resourceId: string; kilograms: number }[];
}

export interface LanderSnapshot {
  /**
   * Landed with the Mission Director aboard, landed and free to fly once they
   * have moved into a Habitat, or on one of the legs of its round trip.
   */
  readonly state: "landed-occupied" | "landed-free" | LanderLeg;
  /** Where it stands, or, while it is away, where it will land as things stand. */
  readonly position: GroundPosition;
  /**
   * The landing pad it stands on, or, while it is away, the one it will land
   * on as things stand; undefined at the landing site.
   */
  readonly landingPadId: string | undefined;
  /** The game-minute its current leg began, or undefined while it is landed. */
  readonly legStartedAtMinute: number | undefined;
  /** The game-minute its current leg ends, or undefined while it is landed. */
  readonly legEndsAtMinute: number | undefined;
  /** The Components aboard it, waiting for the Robot to carry them to the stockpile. */
  readonly cargo: readonly ComponentCount[];
}

export type SendLanderRefusal =
  "mission-director-aboard" | "lander-away" | "cargo-aboard" | "campaign-ended";

export type SendLanderResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: SendLanderRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Sends the landed Lander on its round trip to Earth and back. It can't
 * leave while the Mission Director lives aboard it, or before the Robot has
 * taken its cargo off. It takes off in the game-minute that follows.
 */
export function sendLander(state: CampaignState): SendLanderResult {
  if (state.missionDirector.residence === "lander") {
    return refuse(
      "mission-director-aboard",
      "The Lander can't leave while the Mission Director lives aboard it. They must move into a Habitat first.",
    );
  }
  if (state.lander.trip !== undefined) {
    return refuse(
      "lander-away",
      "The Lander is away, and can only be sent once it has landed.",
    );
  }
  if (state.lander.cargo.length > 0) {
    return refuse(
      "cargo-aboard",
      "The Lander's cargo hasn't been unloaded yet. The Robot has to carry it to the stockpile first.",
    );
  }
  state.lander.trip = startLeg("travelling-to-earth", state.elapsedMinutes);
  return { ok: true };
}

/**
 * Flies the Lander through the game-minute that has just passed: it takes
 * off in the first game-minute after it was sent, and each leg of its round
 * trip gives way to the next as it ends, until it lands: on the landing pad,
 * if one is working, or else at the landing site. It takes the Exports to
 * load aboard as it takes off, and sells them as it reaches Earth. It pays
 * for the Launch manifest as it leaves Earth, after the sale, and delivers
 * it as it lands. Taking off or landing anywhere but on a working landing
 * pad blasts Plume Ejecta over the Structures round it.
 */
export function flyLander(state: CampaignState): GameEvent[] {
  const { trip } = state.lander;
  const atMinute = state.elapsedMinutes;
  if (trip === undefined) return [];
  if (
    trip.leg === "travelling-to-earth" &&
    atMinute === trip.legStartedAtMinute + 1
  ) {
    const fromPad = padAt(state, state.lander.position) !== undefined;
    return [
      { kind: "lander-took-off", atMinute, exports: takeExportsAboard(state) },
      ...(fromPad ? [] : blastPlumeEjecta(state, state.lander.position)),
    ];
  }
  if (atMinute < trip.legEndsAtMinute) return [];
  switch (trip.leg) {
    case "travelling-to-earth":
      state.lander.trip = startLeg("turnaround", atMinute);
      return [
        { kind: "lander-reached-earth", atMinute, ...sellExports(state) },
      ];
    case "turnaround":
      state.lander.trip = startLeg("travelling-to-moon", atMinute);
      return [
        {
          kind: "lander-left-earth",
          atMinute,
          chargedMillionDollars: payForLaunch(state),
        },
      ];
    case "travelling-to-moon": {
      const pad = workingLandingPad(state);
      state.lander.trip = undefined;
      state.lander.position = { ...landingSpot(state) };
      return [
        {
          kind: "lander-landed",
          atMinute,
          delivered: deliverLaunch(state, pad !== undefined),
        },
        ...(pad === undefined
          ? blastPlumeEjecta(state, state.lander.position)
          : []),
      ];
    }
  }
}

export function readLander(state: CampaignState): LanderSnapshot {
  const { trip } = state.lander;
  const position = nextSpot(state);
  return {
    state:
      trip?.leg ??
      (state.missionDirector.residence === "lander"
        ? "landed-occupied"
        : "landed-free"),
    position: { ...position },
    landingPadId: padAt(state, position)?.id,
    legStartedAtMinute: trip?.legStartedAtMinute,
    legEndsAtMinute: trip?.legEndsAtMinute,
    cargo: state.lander.cargo.map((count) => ({ ...count })),
  };
}

/**
 * Where the Lander's next take-off or landing will be, unless it is on a
 * working landing pad, which blasts no Plume Ejecta.
 */
export function nextPlumeEjectaSpot(
  state: CampaignState,
): GroundPosition | undefined {
  const spot = nextSpot(state);
  return padAt(state, spot) === undefined ? spot : undefined;
}

/**
 * Where the Lander next takes off or lands: where it stands, or, while it
 * is away, where it will land as things stand.
 */
function nextSpot(state: CampaignState): GroundPosition {
  return state.lander.trip === undefined
    ? state.lander.position
    : landingSpot(state);
}

/** The landing pad the landed Lander stands on, while it is working. */
export function padUnderLander(
  state: CampaignState,
): StructureState | undefined {
  return state.lander.trip === undefined
    ? padAt(state, state.lander.position)
    : undefined;
}

/**
 * The landing pad the Lander lands on: the first commissioned one that
 * isn't Broken or to be dismantled.
 */
function workingLandingPad(state: CampaignState): StructureState | undefined {
  return state.structures.find(
    (structure) =>
      findStructureType(structure.structureTypeId)?.landingPad === true &&
      !isBroken(structure) &&
      !isDueToBeDismantled(state, structure.id),
  );
}

/** Where the Lander lands, as things stand: on a working landing pad, or at the landing site. */
function landingSpot(state: CampaignState): GroundPosition {
  return (
    workingLandingPad(state)?.position ?? catalogue.landingSite.landerPosition
  );
}

/** The working landing pad centred on a spot, if any. */
function padAt(
  state: CampaignState,
  spot: GroundPosition,
): StructureState | undefined {
  const pad = workingLandingPad(state);
  return pad !== undefined &&
    pad.position.x === spot.x &&
    pad.position.y === spot.y
    ? pad
    : undefined;
}

function startLeg(leg: LanderLeg, atMinute: number): LanderTrip {
  const earthDays = catalogue.lander.roundTripEarthDays;
  const byLeg = {
    "travelling-to-earth": earthDays.toEarth,
    turnaround: earthDays.turnaround,
    "travelling-to-moon": earthDays.toMoon,
  } satisfies Record<LanderLeg, number>;
  return {
    leg,
    legStartedAtMinute: atMinute,
    legEndsAtMinute: atMinute + Math.round(byLeg[leg] * MINUTES_PER_EARTH_DAY),
  };
}

function refuse(reason: SendLanderRefusal, message: string): SendLanderResult {
  return { ok: false, reason, message };
}
