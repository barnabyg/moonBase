import type { ComponentCount } from "../catalogue";
import type { ManifestLine } from "./launch-manifest";
import type { PlumeEjectaDamage } from "./plume-ejecta";

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
      /** A Solar Particle Event will start in the warning time set in the data catalogue. */
      readonly kind: "solar-particle-event-warning";
      readonly atMinute: number;
      readonly startsAtMinute: number;
      readonly endsAtMinute: number;
    }
  | {
      /** A Solar Particle Event has started, multiplying the dose rate where the Mission Director lives. */
      readonly kind: "solar-particle-event-started";
      readonly atMinute: number;
      readonly endsAtMinute: number;
    }
  | {
      /** A Solar Particle Event has ended, and the dose rate is back to usual. */
      readonly kind: "solar-particle-event-ended";
      readonly atMinute: number;
    }
  | {
      /**
       * The Lander has taken off for Earth ("lander-took-off"), or arrived
       * there for turnaround ("lander-reached-earth").
       */
      readonly kind: "lander-took-off" | "lander-reached-earth";
      readonly atMinute: number;
    }
  | {
      /** The Lander has left Earth for the Moon, with the Launch manifest paid for and locked. */
      readonly kind: "lander-left-earth";
      readonly atMinute: number;
      /** The Funding the Launch cost: nothing if the manifest was empty. */
      readonly chargedMillionDollars: number;
    }
  | {
      /**
       * The Lander has landed at the base, and its oxygen and water have
       * joined the life support stocks. Its Components have joined the
       * base's stock too, unless it landed on a landing pad, where they stay
       * aboard for the Robot to unload.
       */
      readonly kind: "lander-landed";
      readonly atMinute: number;
      /** Everything on the Launch manifest it brought, in catalogue order. */
      readonly delivered: readonly ManifestLine[];
    }
  | {
      /** The Robot has carried the cargo of the Lander, landed on a landing pad, to the stockpile. */
      readonly kind: "lander-unloaded";
      readonly atMinute: number;
      /** The Components that joined the base's stock. */
      readonly components: readonly ComponentCount[];
    }
  | {
      /** The Lander's take-off or landing has blasted Plume Ejecta over Structures, wearing down their Condition. */
      readonly kind: "plume-ejecta-damage";
      readonly atMinute: number;
      /** Every Structure worn down, in the order they were commissioned. */
      readonly damaged: readonly PlumeEjectaDamage[];
    }
  | {
      /** A Structure's Condition has reached 0%: it is Broken, and stops working. */
      readonly kind: "structure-broken";
      readonly atMinute: number;
      readonly structureId: string;
      readonly structureTypeId: string;
    }
  | {
      /**
       * A Structure's Condition has fallen below the Maintenance threshold
       * set in the data catalogue, or a solar array's Dust coating has
       * passed the threshold for cleaning, and a Maintenance Work Order has
       * been raised for it.
       */
      readonly kind: "maintenance-needed";
      readonly atMinute: number;
      readonly structureId: string;
      readonly structureTypeId: string;
      readonly conditionPercent: number;
      readonly dustCoatingPercent: number;
      /** Whether it is to restore the Structure's Condition, as things stand. */
      readonly restoresCondition: boolean;
      /** Whether it is to clean the Dust coating off a solar array. */
      readonly cleans: boolean;
    }
  | {
      /**
       * The Robot has finished Maintenance on a Structure, bringing its
       * Condition back to 100% if it used spare Components, so that a
       * Broken one works again, and cleaning off its Dust coating if it
       * cleaned it.
       */
      readonly kind: "maintenance-completed";
      readonly atMinute: number;
      readonly structureId: string;
      readonly structureTypeId: string;
      /** The spare Components it used up: none if it only cleaned. */
      readonly spareComponents: number;
      readonly cleaned: boolean;
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
