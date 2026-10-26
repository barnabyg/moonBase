import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { StructureState } from "./construction";
import type { GameEvent } from "./events";
import { fellToWarningLevel, killMissionDirector } from "./mission-director";
import { minutesUntilPowerLost, powerNetworks } from "./power";

export interface HabitatPowerForecast {
  /** The Habitat the Mission Director lives in. */
  readonly habitatId: string;
  /**
   * Game-minutes until it loses power, following the Daylight and Night
   * ahead, or undefined if it doesn't within the next few Lunations.
   */
  readonly minutesUntilPowerLost: number | undefined;
}

/**
 * When the Habitat the Mission Director lives in will lose power, or
 * undefined while they live aboard the Lander, or once they have died.
 */
export function forecastHabitatPower(
  state: CampaignState,
): HabitatPowerForecast | undefined {
  const habitat = homeHabitat(state);
  if (habitat === undefined) return undefined;
  const network = powerNetworks(state).find((candidate) =>
    candidate.structures.includes(habitat),
  );
  return {
    habitatId: habitat.id,
    minutesUntilPowerLost:
      network === undefined
        ? undefined
        : minutesUntilPowerLost(network, habitat, state.elapsedMinutes),
  };
}

/**
 * Checks the power of the Habitat the Mission Director lives in, once the
 * game-minute's power has been supplied. If it has lost power, the Mission
 * Director dies at once, which ends the Campaign. Otherwise a warning comes
 * as the time until it loses power falls to one of the warning levels set in
 * the data catalogue, given the forecast at the start of the game-minute.
 */
export function watchHabitatPower(
  state: CampaignState,
  minutesUntilPowerLostBefore: number | undefined,
): GameEvent[] {
  const habitat = homeHabitat(state);
  if (habitat === undefined) return [];
  if (!habitat.powered) {
    return killMissionDirector(state, {
      kind: "habitat-power-failed",
      habitatId: habitat.id,
    });
  }
  const after = forecastHabitatPower(state)?.minutesUntilPowerLost;
  if (minutesUntilPowerLostBefore === undefined || after === undefined) {
    return [];
  }
  const warningMinutes = catalogue.habitatPowerWarningHoursLeft.map(
    (hours) => hours * 60,
  );
  return fellToWarningLevel(warningMinutes, minutesUntilPowerLostBefore, after)
    ? [
        {
          kind: "habitat-power-warning",
          atMinute: state.elapsedMinutes,
          habitatId: habitat.id,
          minutesUntilPowerLost: after,
        },
      ]
    : [];
}

/** The Habitat the Mission Director lives in, while they are alive. */
function homeHabitat(state: CampaignState): StructureState | undefined {
  const { missionDirector } = state;
  if (missionDirector.residence !== "habitat" || state.ended !== undefined) {
    return undefined;
  }
  return state.structures.find(
    (structure) => structure.id === missionDirector.habitatId,
  );
}
