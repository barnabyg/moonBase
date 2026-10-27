import type { ComponentCount } from "../catalogue";
import type { ExportLine } from "./exports";
import type { ManifestLine } from "./launch-manifest";
import type { MaintenanceSubject } from "./maintenance";
import type { StrikeTarget } from "./micrometeorites";
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
      /** The Lander has taken off for Earth, with the Exports aboard. */
      readonly kind: "lander-took-off";
      readonly atMinute: number;
      /**
       * The Exports aboard as it took off: from the landing site, those that
       * went aboard from the base's stock as it did; from a landing pad,
       * those the Robot put aboard. None if there were none to load.
       */
      readonly exports: readonly ExportLine[];
    }
  | {
      /**
       * The Lander has arrived on Earth for turnaround, and the Exports
       * aboard have been sold, raising the Funding.
       */
      readonly kind: "lander-reached-earth";
      readonly atMinute: number;
      /** The Exports sold, in catalogue order: none if nothing was aboard. */
      readonly sold: readonly ExportLine[];
      /** The Funding they earned. */
      readonly earnedMillionDollars: number;
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
      /** The Robot has carried the Exports to load from the stockpile aboard the Lander, standing on a landing pad. */
      readonly kind: "lander-loaded";
      readonly atMinute: number;
      /** The Exports it put aboard. */
      readonly exports: readonly ExportLine[];
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
       * A Machine's Condition has reached 0%: it is Broken, has stopped
       * where it stood and has given up any stage of Construction it was
       * carrying out.
       */
      readonly kind: "machine-broken";
      readonly atMinute: number;
      readonly machineId: string;
      readonly machineTypeId: string;
    }
  | {
      /**
       * A Rover's Condition has reached 0%: it is Broken, has stopped where
       * it stood, and can't be driven until it has been maintained.
       */
      readonly kind: "rover-broken";
      readonly atMinute: number;
      readonly roverId: string;
    }
  | {
      /**
       * The Condition of a Structure, Machine or Rover has fallen below the
       * Maintenance threshold set in the data catalogue, or a solar array's
       * Dust coating has passed the threshold for cleaning, and a
       * Maintenance Work Order has been raised for it.
       */
      readonly kind: "maintenance-needed";
      readonly atMinute: number;
      readonly target: MaintenanceSubject;
      readonly conditionPercent: number;
      /** Always 0% for anything but a solar array. */
      readonly dustCoatingPercent: number;
      /** Whether it is to restore the Structure's Condition, as things stand. */
      readonly restoresCondition: boolean;
      /** Whether it is to clean the Dust coating off a solar array. */
      readonly cleans: boolean;
    }
  | {
      /**
       * The Robot has finished Maintenance on a Structure, Machine or Rover,

       * bringing its Condition back to 100% if it used spare Components, so
       * that something Broken works again, and cleaning the Dust coating
       * off a solar array if it cleaned it.
       */
      readonly kind: "maintenance-completed";
      readonly atMinute: number;
      readonly target: MaintenanceSubject;
      /** The spare Components it used up: none if it only cleaned. */
      readonly spareComponents: number;
      readonly cleaned: boolean;
    }
  | {
      /**
       * A Robot's Condition has fallen below the threshold set in the data
       * catalogue, and it has stopped what it was doing to repair itself
       * where the Mission Director lives.
       */
      readonly kind: "robot-self-repair-started";
      readonly atMinute: number;
      readonly robotId: string;
      readonly conditionPercent: number;
      /** Where it is going to repair itself. */
      readonly home: "habitat" | "lander";
      /** Whether it will be a makeshift repair, for want of spare Components. */
      readonly makeshift: boolean;
    }
  | {
      /**
       * A Robot has repaired itself, back to 100% with spare Components or,
       * with none, to the makeshift level set in the data catalogue, and
       * takes up its Work Order again.
       */
      readonly kind: "robot-repaired";
      readonly atMinute: number;
      readonly robotId: string;
      readonly conditionPercent: number;
      /** The spare Components it used up: none for a makeshift repair. */
      readonly spareComponents: number;
    }
  | {
      /**
       * A Robot a Launch brought has climbed down from the Lander and
       * walked to the stockpile, and is ready for work.
       */
      readonly kind: "robot-arrived";
      readonly atMinute: number;
      readonly robotId: string;
    }
  | {
      /** A Micrometeorite has struck, without warning, wearing down what it hit. */
      readonly kind: "micrometeorite-strike";
      readonly atMinute: number;
      readonly target: StrikeTarget;
      /** The Condition it left what it hit with. */
      readonly conditionPercent: number;
    }
  | {
      /**
       * The time until the base's spare Components run out, at the current
       * rate of wear, has fallen to one of the warning levels set in the
       * data catalogue.
       */
      readonly kind: "spare-components-warning";
      readonly atMinute: number;
      readonly inStock: number;
      readonly minutesUntilEmpty: number;
    }
  | {
      /** An Expedition has driven off the map, to come back at the given game-minute. */
      readonly kind: "expedition-left";
      readonly atMinute: number;
      readonly returnsAtMinute: number;
    }
  | {
      /**
       * An Expedition is over: the Robot has unloaded what it brought back
       * at the stockpile, where it joins the base's stock.
       */
      readonly kind: "expedition-returned";
      readonly atMinute: number;
      readonly resourceId: string;
      readonly kilograms: number;
    }
  | {
      /** The Rover was Broken before the Robot could drive it off, so the Expedition is off. */
      readonly kind: "expedition-called-off";
      readonly atMinute: number;
    }
  | {
      /**
       * A Research Task has run its length and is complete: the Science it
       * pays has been added to the base's, and it can't run again.
       */
      readonly kind: "research-task-completed";
      readonly atMinute: number;
      readonly researchTaskId: string;
      /** The Science it earned. */
      readonly science: number;
    }
  | {
      /**
       * The player has unlocked a Design in the Tech Tree, for the Science
       * it cost. Unlocking happens at once, so it comes back from the
       * command, not from advancing the Campaign.
       */
      readonly kind: "design-unlocked";
      readonly atMinute: number;
      readonly designId: string;
      /** The Science it cost. */
      readonly science: number;
    }
  | {
      /**
       * The base has become self-sufficient in a life support stock
       * ("self-sufficiency-gained"): over the data catalogue's window, its
       * Plants made at least as much as the Mission Director used; or it
       * has ceased to be ("self-sufficiency-lost").
       */
      readonly kind: "self-sufficiency-gained" | "self-sufficiency-lost";
      readonly atMinute: number;
      readonly stockId: string;
    }
  | {
      /**
       * A Milestone's condition has held for the first time, and it is
       * reached for good.
       */
      readonly kind: "milestone-reached";
      readonly atMinute: number;
      readonly milestoneId: string;
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
