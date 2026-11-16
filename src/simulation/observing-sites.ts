import {
  catalogue,
  type GroundPosition,
  type ObservingSiteKind,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { type StructureState, findStructureType } from "./construction";
import { nextFraction, seedRandom } from "./random";
import { isDesignUnlocked } from "./tech-tree";

// Observing sites (ADR-0009, #264): the dark and radio-quiet places a Survey
// finds for the late telescopes. A Survey back once a telescope's Design is
// unlocked finds a site of its kind, the first the base hasn't found, and a
// telescope standing wholly on one works its rounds faster (see
// `siteRoundsFactor`). Where a site lies is drawn from the Campaign's generator,
// but from a copy of it, so that finding one leaves the hazards to come as they
// were.

/** A site a Survey has found. */
export interface ObservingSiteState {
  /** Its kind, in the data catalogue. */
  kindId: string;
  /** The centre of its circle. */
  position: GroundPosition;
}

/** A found site, as the player sees it. */
export interface ObservingSiteSnapshot {
  readonly kindId: string;
  readonly label: string;
  readonly position: GroundPosition;
  readonly radiusMetres: number;
  /** The kind of Structure the telescopes it suits are kept clear of. */
  readonly keptClearOf: ObservingSiteKind["keptClearOf"];
  /** How far its centre is from the Lander, in metres. */
  readonly fromLanderMetres: number;
}

/** How many places are tried for a site clear of those found before. */
const TRIES = 20;

/** The kind of site with this id; a kind gone from the catalogue is refused on loading. */
export function observingSiteKind(
  kindId: string,
): ObservingSiteKind | undefined {
  return catalogue.expeditions.observingSites.kinds.find(
    ({ id }) => id === kindId,
  );
}

/**
 * The kind of site that suits a type of Structure: one that earns Science by
 * rounds, as a telescope does, and is kept clear of what the kind is clear of.
 * Undefined for any other, an antenna field among them.
 */
export function observingSiteKindFor(
  structureTypeId: string,
): ObservingSiteKind | undefined {
  const type = findStructureType(structureTypeId);
  if (
    type === undefined ||
    (type.observingRounds === undefined && type.radioArray === undefined)
  ) {
    return undefined;
  }
  return catalogue.expeditions.observingSites.kinds.find(
    ({ keptClearOf }) => keptClearOf === type.keepClear?.of,
  );
}

/**
 * Finds a site, as a Survey comes back: the first kind whose Design is unlocked
 * and that the base hasn't found, if any.
 */
export function findObservingSite(
  state: CampaignState,
): ObservingSiteState | undefined {
  const { kinds, radiusMetres, fromLanderMetres } =
    catalogue.expeditions.observingSites;
  const index = kinds.findIndex(
    (kind) =>
      isDesignUnlocked(state, kind.designId) &&
      !state.observingSites.some(({ kindId }) => kindId === kind.id),
  );
  const kind = kinds[index];
  if (kind === undefined) return undefined;
  const { a, b, c, d } = state.random;
  const draws = seedRandom((a ^ b ^ c ^ d ^ (index + 1)) >>> 0);
  const lander = state.lander.position;
  const { least, most } = fromLanderMetres;
  let position: GroundPosition = lander;
  for (let tries = 0; tries < TRIES; tries++) {
    const angle = nextFraction(draws) * 2 * Math.PI;
    // Evenly over the ground between the two distances.
    const distance = Math.sqrt(
      least * least + nextFraction(draws) * (most * most - least * least),
    );
    position = {
      x: lander.x + distance * Math.cos(angle),
      y: lander.y + distance * Math.sin(angle),
    };
    const clear = state.observingSites.every(
      (found) =>
        Math.hypot(
          found.position.x - position.x,
          found.position.y - position.y,
        ) >=
        2 * radiusMetres,
    );
    if (clear) break;
  }
  const site = { kindId: kind.id, position };
  state.observingSites.push(site);
  return site;
}

/**
 * The found site a Structure stands wholly on, of the kind that suits it (see
 * `observingSiteKindFor`). Undefined for a Structure no kind suits, or one that
 * stands on no such site.
 */
export function observingSiteUnder(
  sites: readonly ObservingSiteState[],
  structure: Pick<StructureState, "structureTypeId" | "position">,
): ObservingSiteState | undefined {
  const kind = observingSiteKindFor(structure.structureTypeId);
  const type = findStructureType(structure.structureTypeId);
  if (kind === undefined || type === undefined) return undefined;
  const { radiusMetres } = catalogue.expeditions.observingSites;
  return sites.find(
    (site) =>
      site.kindId === kind.id &&
      Math.hypot(
        site.position.x - structure.position.x,
        site.position.y - structure.position.y,
      ) +
        type.footprintRadiusMetres <=
        radiusMetres,
  );
}

/**
 * How much faster a telescope works its rounds for where it stands: half as fast
 * again, as the catalogue has it, on a site that suits it, else as usual.
 */
export function siteRoundsFactor(
  state: CampaignState,
  structure: Pick<StructureState, "structureTypeId" | "position">,
): number {
  return observingSiteUnder(state.observingSites, structure) === undefined
    ? 1
    : 1 + catalogue.expeditions.observingSites.roundsFasterBy;
}

export function readObservingSites(
  state: CampaignState,
): ObservingSiteSnapshot[] {
  const { radiusMetres } = catalogue.expeditions.observingSites;
  const lander = state.lander.position;
  return state.observingSites.flatMap((site) => {
    const kind = observingSiteKind(site.kindId);
    if (kind === undefined) return [];
    return [
      {
        kindId: kind.id,
        label: kind.label,
        position: { ...site.position },
        radiusMetres,
        keptClearOf: kind.keptClearOf,
        fromLanderMetres: Math.hypot(
          site.position.x - lander.x,
          site.position.y - lander.y,
        ),
      },
    ];
  });
}
