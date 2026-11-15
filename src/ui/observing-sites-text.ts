import { catalogue } from "../catalogue";
import {
  observingSiteKind,
  observingSiteKindFor,
  observingSiteUnder,
  type GroundPosition,
  type ObservingSiteSnapshot,
} from "../simulation";
import { inSentence, structureLabel } from "./labels";

// What the player reads of observing sites (#264): the dark and radio-quiet sites
// Surveys find, where a telescope works its rounds faster.

const { kinds, roundsFasterBy } = catalogue.expeditions.observingSites;

/** How much faster a telescope on a site works its rounds, for example "50%". */
export function formatSiteSpeedUp(): string {
  return `${Math.round(roundsFasterBy * 100)}%`;
}

/**
 * The telescopes a kind of site suits, in words with their article, for example
 * "an infrared telescope": those that earn by rounds and are kept clear of what
 * the site is clear of.
 */
export function telescopesSuited(kindId: string): string {
  const names = catalogue.structureTypes
    .filter((type) => observingSiteKindFor(type.id)?.id === kindId)
    .map((type) => withArticle(inSentence(structureLabel(type.id))));
  return names.join(" or ");
}

function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
}

/** The name of a kind of site in a sentence, for example "dark site". */
export function siteName(kindId: string): string {
  return inSentence(observingSiteKind(kindId)?.label ?? kindId);
}

/**
 * Says what a Survey found, for its notification, for example "found a dark site,
 * where an infrared telescope works its rounds 50% faster".
 */
export function formatSiteFound(kindId: string): string {
  return `found a ${siteName(kindId)}, where ${telescopesSuited(kindId)} works its rounds ${formatSiteSpeedUp()} faster`;
}

/**
 * Says what a found site is good for, for the Expeditions screen, for example
 * "Dark site, 310 m from the Lander: an infrared telescope standing wholly on it
 * works its rounds 50% faster."
 */
export function describeFoundSite(site: ObservingSiteSnapshot): string {
  return `${site.label}, ${Math.round(site.fromLanderMetres)} m from the Lander: ${telescopesSuited(site.kindId)} standing wholly on it works its rounds ${formatSiteSpeedUp()} faster.`;
}

/**
 * Says what the next Survey back will find as well as its Science, for the
 * Expeditions screen, or undefined if it will find none: the first kind whose
 * Design is unlocked that hasn't been found.
 */
export function describeNextSite(
  unlockedDesignIds: readonly string[],
  found: readonly ObservingSiteSnapshot[],
): string | undefined {
  const next = kinds.find(
    (kind) =>
      unlockedDesignIds.includes(kind.designId) &&
      !found.some(({ kindId }) => kindId === kind.id),
  );
  return next === undefined
    ? undefined
    : `The next Survey back also finds a ${siteName(next.id)} for ${telescopesSuited(next.id)}.`;
}

/**
 * Says whether a telescope at a position stands on a site that suits it, for its
 * pop-up and the build menu's hint, for example "on the dark site, working its
 * rounds 50% faster", "not wholly on the dark site, 310 m from the Lander", or
 * "no dark site found yet: a Survey finds one"; undefined for a Structure that
 * no site suits.
 */
export function formatSiteFor(
  structureTypeId: string,
  position: GroundPosition,
  sites: readonly ObservingSiteSnapshot[],
): string | undefined {
  const kind = observingSiteKindFor(structureTypeId);
  if (kind === undefined) return undefined;
  const site = sites.find(({ kindId }) => kindId === kind.id);
  if (site === undefined) {
    return `no ${siteName(kind.id)} found yet: a Survey finds one`;
  }
  return observingSiteUnder(sites, { structureTypeId, position }) === undefined
    ? `not wholly on the ${siteName(kind.id)}, ${Math.round(site.fromLanderMetres)} m from the Lander`
    : `on the ${siteName(kind.id)}, working its rounds ${formatSiteSpeedUp()} faster`;
}
