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
    };
