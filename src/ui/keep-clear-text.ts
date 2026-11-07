import type { KeepClear, KeepClearOf } from "../catalogue";
import {
  keepClearOf,
  structuresInTheWay,
  type GroundPosition,
  type StandingStructure,
} from "../simulation";
import { listInWords, plural } from "./format";
import { inSentence, structureLabel } from "./labels";

/** What the player calls a radius that keeps a kind of Structure away, and that kind. */
const WORDS: Record<
  KeepClearOf,
  { readonly radius: string; readonly kind: string }
> = {
  lit: { radius: "dark radius", kind: "lit Structure" },
  plants: { radius: "quiet radius", kind: "Plant" },
};

/** The name of a type of Structure's radius, for example "dark radius". */
export function radiusName(rule: KeepClear): string {
  return WORDS[rule.of].radius;
}

/**
 * Says what keeps a Structure of the given type at the given position from
 * working, for example "2 lit Structures within its dark radius of 80 m: Light
 * Mast and Tall Light Mast", or that nothing does, for example "nothing lit within
 * its dark radius of 80 m"; undefined if it is kept clear of nothing.
 */
export function formatInTheWay(
  structureTypeId: string,
  position: GroundPosition,
  structures: readonly StandingStructure[],
  ownId?: string,
): string | undefined {
  const rule = keepClearOf(structureTypeId);
  if (rule === undefined) return undefined;
  const { radius, kind } = WORDS[rule.of];
  const within = `within its ${radius} of ${rule.radiusMetres} m`;
  const inTheWay = structuresInTheWay(
    structureTypeId,
    position,
    structures,
    ownId,
  );
  if (inTheWay.length === 0) return `no ${kind} ${within}`;
  return `${plural(inTheWay.length, kind)} ${within}: ${listInWords(
    inTheWay.map((other) => inSentence(structureLabel(other.structureTypeId))),
  )}`;
}
