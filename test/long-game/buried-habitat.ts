// The long-game play guide's shipping, and its move into a Buried Habitat.
import { catalogue } from "../../src/catalogue";
import {
  type ManifestLine,
  nextSolarArray,
  type Snapshot,
  SOLAR_ARRAY_ID,
} from "../../src/simulation";
import { type Play, succeed } from "../reference-campaign";
import { toGameMinutes } from "../scenario";
import {
  BURIED_HABITAT_EARTH_DAY,
  BURIED_HABITAT_SITE,
  DAYLIGHT_TO_BUILD_AND_MOVE,
} from "./settings";

/** The Components a type of Structure takes, as Launch manifest lines. */
export function manifestLinesOf(
  structureTypeId: string,
): readonly ManifestLine[] {
  return (
    catalogue.structureTypes.find(({ id }) => id === structureTypeId)
      ?.components ?? []
  ).map(({ componentId, count }) => ({ itemId: componentId, count }));
}

/**
 * What to order of a type of Structure as things stand: for a solar array, the
 * parts on sale, as a Design takes the older ones off it.
 */
export function linesToOrder(
  state: Snapshot,
  structureTypeId: string,
): readonly ManifestLine[] {
  if (structureTypeId !== SOLAR_ARRAY_ID) {
    return manifestLinesOf(structureTypeId);
  }
  const kind = nextSolarArray(
    {
      ...state,
      stockpile: { components: [] },
      lander: { cargo: [] },
      constructions: [],
    },
    [],
  );
  return manifestLinesOf(kind?.id ?? structureTypeId);
}

/** What of these Launch manifest lines the base lacks in its stock. */
export function missingFromStock(
  state: Snapshot,
  lines: readonly ManifestLine[],
): ManifestLine[] {
  return lines.flatMap(({ itemId, count }) => {
    const inStock =
      state.stockpile.components.find((stock) => stock.componentId === itemId)
        ?.count ?? 0;
    return count > inStock ? [{ itemId, count: count - inStock }] : [];
  });
}

/**
 * Sends for what a Buried Habitat needs, as much on each Launch as its Payload
 * Mass leaves room for beside the supplies already on the manifest, and plans
 * it early in a Daylight once it has all come.
 */
export function shipBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = "buried-habitat";
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: BURIED_HABITAT_EARTH_DAY }) ||
    !state.unlockedDesignIds.includes(buried) ||
    [...state.constructions, ...state.structures].some(
      ({ structureTypeId }) => structureTypeId === buried,
    )
  ) {
    return;
  }
  const missing = missingFromStock(state, manifestLinesOf(buried));
  if (missing.length === 0) {
    if (
      state.lunation.part === "daylight" &&
      state.lunation.minutesRemaining >=
        toGameMinutes(DAYLIGHT_TO_BUILD_AND_MOVE)
    ) {
      play.plan(buried, BURIED_HABITAT_SITE);
    }
    return;
  }
  // The manifest can change until the Lander leaves Earth, and the trip before
  // has been unloaded, so all the base lacks has yet to be sent for.
  if (state.lander.state !== "travelling-to-earth") return;
  const massOf = (itemId: string) =>
    catalogue.launch.items.find(({ id }) => id === itemId)?.massKilograms ?? 0;
  const manifest = new Map(
    state.launchManifest.items.map(({ itemId, count }) => [itemId, count]),
  );
  let room = catalogue.launch.payloadMassLimitKilograms;
  for (const [itemId, count] of manifest) room -= massOf(itemId) * count;
  let added = false;
  for (const { itemId, count } of missing) {
    const already = manifest.get(itemId) ?? 0;
    const more = Math.min(count - already, Math.floor(room / massOf(itemId)));
    if (more <= 0) continue;
    room -= more * massOf(itemId);
    manifest.set(itemId, already + more);
    added = true;
  }
  if (added) {
    succeed(
      play.campaign.setLaunchManifest(
        [...manifest].map(([itemId, count]) => ({ itemId, count })),
      ),
      "Putting the Buried Habitat on the Launch manifest",
    );
  }
}

/**
 * Moves the Mission Director into a Buried Habitat as soon as it stands and has
 * power, then dismantles the old Habitat and what is over it, one by one.
 */
export function moveIntoBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = state.structures.find(
    (structure) => structure.structureTypeId === "buried-habitat",
  );
  if (buried?.powered !== true) return;
  const { missionDirector } = state;
  if (
    missionDirector.residence !== "habitat" ||
    missionDirector.habitatId !== buried.id
  ) {
    succeed(
      play.campaign.moveMissionDirectorIn(buried.id),
      "Moving the Mission Director into the Buried Habitat",
    );
    return;
  }
  if (state.dismantlings.length > 0) return;
  for (const structureTypeId of [
    "water-wall",
    "regolith-shielding",
    "habitat",
  ]) {
    const next = state.structures.find(
      (structure) => structure.structureTypeId === structureTypeId,
    );
    if (next !== undefined) {
      succeed(
        play.campaign.dismantleStructure(next.id),
        `Dismantling the old ${structureTypeId}`,
      );
      return;
    }
  }
}
