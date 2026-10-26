/**
 * A notable event in the Campaign. "Advance to next event" runs the
 * simulation until one of these happens.
 */
export type GameEvent =
  | { readonly kind: "night-started"; readonly atMinute: number }
  | { readonly kind: "daylight-started"; readonly atMinute: number }
  | {
      readonly kind: "construction-completed";
      readonly atMinute: number;
      /** The id of the newly commissioned Structure. */
      readonly structureId: string;
      readonly structureTypeId: string;
    }
  | {
      /** A Structure has been taken apart and its recovered Components are back in stock. */
      readonly kind: "structure-dismantled";
      readonly atMinute: number;
      readonly structureId: string;
      readonly structureTypeId: string;
    }
  | {
      /** A life support stock has fallen to one of the warning levels set in the data catalogue. */
      readonly kind: "life-support-warning";
      readonly atMinute: number;
      readonly stockId: string;
      /** Game-minutes until it runs out, at the rate it is being used up. */
      readonly minutesUntilEmpty: number;
    }
  | {
      /**
       * The time until the Habitat the Mission Director lives in loses power
       * has fallen to one of the warning levels set in the data catalogue.
       */
      readonly kind: "habitat-power-warning";
      readonly atMinute: number;
      readonly habitatId: string;
      /** Game-minutes until it loses power, as things stand. */
      readonly minutesUntilPowerLost: number;
    }
  | {
      /**
       * The time until the Mission Director's Radiation Dose reaches the
       * limit has fallen to one of the warning levels set in the data
       * catalogue.
       */
      readonly kind: "radiation-dose-warning";
      readonly atMinute: number;
      /** Game-minutes until it reaches the limit, at the rate it is rising. */
      readonly minutesUntilLimit: number;
    }
  | {
      /** The Mission Director has died, which ends the Campaign. */
      readonly kind: "mission-director-died";
      readonly atMinute: number;
      readonly cause: DeathCause;
    };

/** How the Mission Director died. */
export type DeathCause =
  | {
      readonly kind: "ran-out";
      /** The life support stock that ran out. */
      readonly stockId: string;
    }
  | {
      /** The Habitat they lived in lost power. */
      readonly kind: "habitat-power-failed";
      readonly habitatId: string;
    }
  | {
      /** Their Radiation Dose reached the limit. */
      readonly kind: "radiation-dose-limit";
    };
