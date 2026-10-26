import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { MINUTES_PER_EARTH_DAY } from "./clock";
import type { GameEvent } from "./events";

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
  /** Where it stands, or stood before it took off, and lands again. */
  position: GroundPosition;
  /** The round trip it is on, or undefined while it is landed. */
  trip: LanderTrip | undefined;
}

export interface LanderSnapshot {
  /**
   * Landed with the Mission Director aboard, landed and free to fly once they
   * have moved into a Habitat, or on one of the legs of its round trip.
   */
  readonly state: "landed-occupied" | "landed-free" | LanderLeg;
  /** Where it stands, or, while it is away, where it will land. */
  readonly position: GroundPosition;
  /** The game-minute its current leg began, or undefined while it is landed. */
  readonly legStartedAtMinute: number | undefined;
  /** The game-minute its current leg ends, or undefined while it is landed. */
  readonly legEndsAtMinute: number | undefined;
}

export type SendLanderRefusal =
  "mission-director-aboard" | "lander-away" | "campaign-ended";

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
 * leave while the Mission Director lives aboard it. It takes off in the
 * game-minute that follows.
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
  state.lander.trip = startLeg("travelling-to-earth", state.elapsedMinutes);
  return { ok: true };
}

/**
 * Flies the Lander through the game-minute that has just passed: it takes
 * off in the first game-minute after it was sent, and each leg of its round
 * trip gives way to the next as it ends, until it lands where it took off.
 */
export function flyLander(state: CampaignState): GameEvent[] {
  const { trip } = state.lander;
  const atMinute = state.elapsedMinutes;
  if (trip === undefined) return [];
  if (
    trip.leg === "travelling-to-earth" &&
    atMinute === trip.legStartedAtMinute + 1
  ) {
    return [{ kind: "lander-took-off", atMinute }];
  }
  if (atMinute < trip.legEndsAtMinute) return [];
  switch (trip.leg) {
    case "travelling-to-earth":
      state.lander.trip = startLeg("turnaround", atMinute);
      return [{ kind: "lander-reached-earth", atMinute }];
    case "turnaround":
      state.lander.trip = startLeg("travelling-to-moon", atMinute);
      return [{ kind: "lander-left-earth", atMinute }];
    case "travelling-to-moon":
      state.lander.trip = undefined;
      return [{ kind: "lander-landed", atMinute }];
  }
}

export function readLander(state: CampaignState): LanderSnapshot {
  const { trip } = state.lander;
  return {
    state:
      trip?.leg ??
      (state.missionDirector.residence === "lander"
        ? "landed-occupied"
        : "landed-free"),
    position: { ...state.lander.position },
    legStartedAtMinute: trip?.legStartedAtMinute,
    legEndsAtMinute: trip?.legEndsAtMinute,
  };
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
