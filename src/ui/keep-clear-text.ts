import type { KeepClear, KeepClearOf } from "../catalogue";
import {
  keepClearOf,
  structuresInTheWay,
  type GroundPosition,
  type StandingStructure,
} from "../simulation";
import { listInWords, plural } from "./format";
import { inSentence, structureLabel } from "./labels";

/**
 * What the player calls a radius that keeps a kind of Structure away, that kind,
 * and an example of it.
 */
const WORDS: Record<
  KeepClearOf,
  {
    readonly radius: string;
    readonly kind: string;
    readonly example: string;
  }
> = {
  lit: {
    radius: "dark radius",
    kind: "lit Structure",
    example: "a Light Mast",
  },
  plants: {
    radius: "quiet radius",
    kind: "Plant",
    example: "an extraction plant",
  },
};

/**
 * Says, for a Structure's description, what stops it doing its work, for example
 * "It can't observe while a lit Structure, such as a Light Mast, stands within 80
 * m of it, its dark radius".
 */
export function describeKeepClear(rule: KeepClear, work: string): string {
  const { radius, kind, example } = WORDS[rule.of];
  return `It can't ${work} while a ${kind}, such as ${example}, stands within ${rule.radiusMetres} m of it, its ${radius}`;
}

/**
 * Says what kind of Structure stops one of the given type working, for example "a
 * lit Structure is within its dark radius" or, without the verb, "a Plant within
 * its quiet radius"; undefined if it is kept clear of nothing.
 */
export function formatKeptClearOf(
  structureTypeId: string,
  verb: "is" | "none" = "is",
): string | undefined {
  const rule = keepClearOf(structureTypeId);
  if (rule === undefined) return undefined;
  const { radius, kind } = WORDS[rule.of];
  return `a ${kind}${verb === "is" ? " is" : ""} within its ${radius}`;
}

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
