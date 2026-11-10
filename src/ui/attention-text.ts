import { catalogue } from "../catalogue";
import type { MapSubject } from "../render/renderer";
import type { Forecasts, Snapshot } from "../simulation";
import {
  LOW_CONDITION_PERCENT,
  formatCondition,
  formatShortDuration,
  listInWords,
  plural,
} from "./format";
import {
  machineLabel,
  resourceRefLabel,
  stockLabel,
  structureLabel,
} from "./labels";
import { formatSolarParticleEvent } from "./status-panel-text";
import {
  homeHabitat,
  warnsOfHabitatPower,
  warnsOfLifeSupport,
  warnsOfRadiationDose,
  warnsOfSpareComponents,
} from "./status-warnings";
import { isToBeDismantled } from "./structure-state";

// What needs the player now, in words, for the list at the top of the status
// panel: what still stands, most urgent first, where the notifications say
// what happened as it happens.

/**
 * A line of the status panel that shows as a warning, which a line of the
 * needs-attention list leads to: a Solar Particle Event, the Habitat's power,
 * a life support stock by its id, the Radiation Dose or the spare Components.
 */
export type StatusLine =
  | "solar-particle-event"
  | "habitat-power"
  | `life-support:${string}`
  | "radiation-dose"
  | "spare-components";

/** Every kind of line the needs-attention list can hold, by its id, most urgent first. */
export const ATTENTION_ORDER: readonly string[] = [
  "solar-particle-event",
  "habitat-power",
  ...catalogue.lifeSupportStocks.map(({ id }) => `life-support:${id}`),
  "radiation-dose",
  "spare-components",
  "broken",
  "constructions-waiting",
  "plants-waiting",
  "low-condition",
  "plants-switched-off",
];

/**
 * Which of the lines already listed a new one goes straight before, to
 * keep the list most urgent first whatever order its lines arose in: the
 * most urgent of those less urgent than it, or undefined if it goes last.
 * A line of a kind the order doesn't know goes last.
 */
export function nextInOrder(
  order: readonly string[],
  listed: Iterable<string>,
  id: string,
): string | undefined {
  const place = (other: string): number => {
    const at = order.indexOf(other);
    return at === -1 ? order.length : at;
  };
  return [...listed]
    .filter((other) => place(other) > place(id))
    .sort((a, b) => place(a) - place(b))[0];
}

/** Where a line of the needs-attention list leads: where what it reports is dealt with. */
export type AttentionTarget =
  /** A line of the status panel, which says more. */
  | { readonly kind: "status"; readonly line: StatusLine }
  /** Something on the base map, to find there. */
  | { readonly kind: "map"; readonly subject: MapSubject };

/** One line of the needs-attention list. */
export interface AttentionLine {
  /** What kind of line it is, the same for as long as it stands, to keep it in its place by. */
  readonly id: string;
  readonly text: string;
  readonly leadsTo: AttentionTarget;
}

/** Something on the base map that a line reports, by the name the panels give it. */
interface Reported {
  readonly label: string;
  readonly subject: MapSubject;
}

/**
 * Names what a line reports, the same names together, for example "2 ×
 * Solar array, Excavator and Rover".
 */
function nameTogether(reported: readonly Reported[]): string {
  const counts = new Map<string, number>();
  for (const { label } of reported) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return listInWords(
    [...counts].map(([label, count]) =>
      count === 1 ? label : `${count} × ${label}`,
    ),
  );
}

/**
 * Every commissioned Structure that isn't to be dismantled, every Machine and
 * every Rover, with its Condition. One to be dismantled is left out, as the
 * player has dealt with it, and so is a Robot, which repairs itself.
 */
function wornThings(
  snapshot: Snapshot,
): (Reported & { readonly conditionPercent: number })[] {
  return [
    ...snapshot.structures
      .filter(({ id }) => !isToBeDismantled(snapshot, id))
      .map(({ id, structureTypeId, conditionPercent }) => ({
        label: structureLabel(structureTypeId),
        subject: { kind: "structure", id } as const,
        conditionPercent,
      })),
    ...snapshot.machines.map(({ id, machineTypeId, conditionPercent }) => ({
      label: machineLabel(machineTypeId),
      subject: { kind: "machine", id } as const,
      conditionPercent,
    })),
    ...snapshot.rovers.map(({ id, conditionPercent }) => ({
      label: catalogue.rover.label,
      subject: { kind: "rover", id } as const,
      conditionPercent,
    })),
  ];
}

/**
 * What the status panel's own lines warn of, in the panel's order, each
 * leading to its line: a Solar Particle Event, the Habitat's power, the life
 * support stocks, the Radiation Dose and the spare Components.
 */
function statusWarnings(
  snapshot: Snapshot,
  forecasts: Forecasts,
): AttentionLine[] {
  const lines: AttentionLine[] = [];
  const warn = (line: StatusLine, text: string): void => {
    lines.push({ id: line, text, leadsTo: { kind: "status", line } });
  };
  if (snapshot.solarParticleEvent !== undefined) {
    const { value } = formatSolarParticleEvent(
      snapshot.solarParticleEvent,
      snapshot.clock.elapsedMinutes,
    );
    warn("solar-particle-event", `Solar Particle Event ${value}`);
  }
  if (warnsOfHabitatPower(snapshot, forecasts.habitatPower)) {
    const left = forecasts.habitatPower?.minutesUntilPowerLost;
    warn(
      "habitat-power",
      homeHabitat(snapshot)?.powered === false || left === undefined
        ? "Habitat power has failed"
        : `Habitat power fails in ${formatShortDuration(left)}`,
    );
  }
  for (const type of catalogue.lifeSupportStocks) {
    const stock = snapshot.lifeSupport.find(
      ({ stockId }) => stockId === type.id,
    );
    const forecast = forecasts.lifeSupport.find(
      ({ stockId }) => stockId === type.id,
    );
    if (stock === undefined || !warnsOfLifeSupport(type, stock, forecast)) {
      continue;
    }
    const left = forecast?.minutesUntilEmpty;
    warn(
      `life-support:${type.id}`,
      stock.kilograms === 0 || left === undefined
        ? `${stockLabel(type.id)} has run out`
        : `${stockLabel(type.id)} runs out in ${formatShortDuration(left)}`,
    );
  }
  if (
    warnsOfRadiationDose(
      snapshot.radiationDoseMillisieverts,
      forecasts.radiationDose,
    )
  ) {
    const left = forecasts.radiationDose.minutesUntilLimit;
    warn(
      "radiation-dose",
      snapshot.radiationDoseMillisieverts >=
        catalogue.radiation.doseLimitMillisieverts || left === undefined
        ? "Radiation Dose has reached the limit"
        : `Radiation Dose reaches the limit in ${formatShortDuration(left)}`,
    );
  }
  if (warnsOfSpareComponents(forecasts.spareComponents)) {
    const left = forecasts.spareComponents.minutesUntilEmpty ?? 0;
    warn(
      "spare-components",
      left === 0
        ? "Spare Components: too few for the wear"
        : `Spare Components run out in ${formatShortDuration(left)}`,
    );
  }
  return lines;
}

/**
 * What needs the player now, most urgent first, each line with where it
 * leads; nothing while there is nothing to report. First what the status
 * panel's own lines warn of, then anything Broken, Constructions waiting for
 * Components that aren't in the base's stock, Plants standing idle for want of
 * an input, anything low on Condition, and last the Plants the player has
 * switched off. Several of a kind share a line, which leads to the first of
 * them, or the lowest on Condition.
 */
export function listAttention(
  snapshot: Snapshot,
  forecasts: Forecasts,
): AttentionLine[] {
  const lines = statusWarnings(snapshot, forecasts);
  /** Adds a line about things on the map, leading to the first of them, if there are any. */
  const report = (
    id: string,
    reported: readonly Reported[],
    text: (first: Reported) => string,
  ): void => {
    const [first] = reported;
    if (first === undefined) return;
    lines.push({
      id,
      text: text(first),
      leadsTo: { kind: "map", subject: first.subject },
    });
  };

  const worn = wornThings(snapshot);
  const broken = worn.filter(({ conditionPercent }) => conditionPercent <= 0);
  report("broken", broken, ({ label }) =>
    broken.length === 1
      ? `${label} is Broken`
      : `Broken: ${nameTogether(broken)}`,
  );

  const constructions = snapshot.constructions
    .filter(({ waiting }) => waiting?.reason === "missing-components")
    .map(({ id, structureTypeId }) => ({
      label: structureLabel(structureTypeId),
      subject: { kind: "structure", id } as const,
    }));
  report("constructions-waiting", constructions, ({ label }) =>
    constructions.length === 1
      ? `${label} is waiting for Components`
      : `${constructions.length} Constructions waiting for Components`,
  );

  const idle = snapshot.structures.flatMap((structure) => {
    const stop = structure.plant?.stoppedFor;
    return stop?.reason === "no-input" || stop?.reason === "reserve"
      ? [
          {
            label: structureLabel(structure.structureTypeId),
            subject: { kind: "structure", id: structure.id } as const,
            input: resourceRefLabel(stop.resource),
          },
        ]
      : [];
  });
  report("plants-waiting", idle, ({ label }) =>
    idle.length === 1
      ? `${label} is waiting for ${idle[0]?.input ?? "an input"}`
      : `${idle.length} Plants waiting for an input`,
  );

  const low = worn
    .filter(
      ({ conditionPercent }) =>
        conditionPercent > 0 && conditionPercent < LOW_CONDITION_PERCENT,
    )
    .sort((a, b) => a.conditionPercent - b.conditionPercent);
  const lowest = formatCondition(low[0]?.conditionPercent ?? 0);
  report("low-condition", low, ({ label }) =>
    low.length === 1
      ? `${label} is at ${lowest} Condition`
      : `${low.length} low on Condition, the lowest at ${lowest}`,
  );

  const switchedOff = snapshot.structures
    .filter(({ plant, switchedOff: off }) => plant !== undefined && off)
    .map(({ id, structureTypeId }) => ({
      label: structureLabel(structureTypeId),
      subject: { kind: "structure", id } as const,
    }));
  report(
    "plants-switched-off",
    switchedOff,
    () => `${plural(switchedOff.length, "Plant")} switched off`,
  );
  return lines;
}
