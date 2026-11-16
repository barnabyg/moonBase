import type {
  MissionDirectorResidence,
  PowerForecast,
  PowerNetworkSnapshot,
  Snapshot,
} from "../simulation";
import { formatCharge, formatShortDuration, kilowatts, signed } from "./format";
import type { Stat } from "./stat";
import { findStructureType } from "../simulation";

// The status panel's power figures in words, and the summary beside the
// folded power section's title.

/** Adds up one figure across all the base's power networks. */
function sumNetworks(
  power: Snapshot["power"],
  pick: (network: PowerNetworkSnapshot) => number,
): number {
  return power.networks.reduce((sum, network) => sum + pick(network), 0);
}

/** The power the base makes and uses across its networks, in kilowatts. */
function basePower(power: Snapshot["power"]): {
  readonly made: number;
  readonly used: number;
} {
  return {
    made: sumNetworks(power, (network) => network.generationKilowatts),
    used: sumNetworks(power, (network) => network.consumptionKilowatts),
  };
}

/**
 * The power the base has to spare across its networks, or how far short it
 * falls, as it does at Night when its solar arrays make none, for example
 * "+9.7 kW" or "−36.5 kW". One decimal place is enough to steer by.
 */
function powerToSpare(power: Snapshot["power"]): string {
  const { made, used } = basePower(power);
  return signed(made - used, 1, "kW");
}

/**
 * Says how much power the base has to spare, then what it makes and uses,
 * in the same kilowatts, for example "+9.7 kW" and "10.0 made, 0.3 used",
 * short enough to stay on one line.
 */
export function formatBasePower(power: Snapshot["power"]): Stat {
  const { made, used } = basePower(power);
  return {
    value: powerToSpare(power),
    note: `${made.toFixed(1)} made, ${used.toFixed(1)} used`,
  };
}

/**
 * Sums power networks to the hundredth of a kilowatt, for a Structure's
 * pop-up, where one network's small loads show, for example "10.00 kW made"
 * and "0.30 kW used".
 */
export function formatPower(power: Snapshot["power"]): Stat {
  const { made, used } = basePower(power);
  return {
    value: `${kilowatts(made)} made`,
    note: `${kilowatts(used)} used`,
  };
}

/**
 * What a network's stored energy does when the forecast finds it doesn't run
 * out. The forecast follows the Daylight and Night ahead (see
 * `PowerForecast`), so that is what it means, in Daylight as much as at
 * Night, where "doesn't run out" read as being about now.
 */
const LASTS_THE_NIGHT = "lasts the Night";

/**
 * Says how much energy the base has stored and when it will run out, for
 * example "42.0 / 60.0 kWh" and "lasts 8d 8h", or "lasts the Night" when it
 * doesn't, with how full its battery banks are, from 0 to 1, or undefined if
 * it has none.
 */
export function formatStoredPower(
  power: Snapshot["power"],
  forecast: PowerForecast,
): Stat & { readonly fraction: number | undefined } {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const capacity = total((network) => network.storageCapacityKilowattHours);
  if (capacity === 0) return { value: "no battery banks", fraction: undefined };
  const storedKilowattHours = total((network) => network.storedKilowattHours);
  const value = formatCharge(storedKilowattHours, capacity);
  const fraction = storedKilowattHours / capacity;
  const { minutesUntilEmpty } = forecast;
  if (minutesUntilEmpty !== undefined) {
    return {
      value,
      note: `lasts ${formatShortDuration(minutesUntilEmpty)}`,
      fraction,
    };
  }
  return {
    value,
    note: storedKilowattHours > 0 ? LASTS_THE_NIGHT : "empty",
    fraction,
  };
}

/** Whether a Structure of this type generates or stores power. */
function isPowerSource(structureTypeId: string): boolean {
  const type = findStructureType(structureTypeId);
  return (
    type !== undefined &&
    (type.power.generationKilowatts > 0 || type.power.storageKilowattHours > 0)
  );
}

/**
 * The network of the Habitat the Mission Director lives in, if it is apart
 * from some of the base's power: another network has a solar array or a
 * battery bank, which the base's totals count but the Habitat can't draw on.
 * Undefined while they live aboard the Lander, or when no other network
 * has a power source.
 */
export function habitatNetworkApart(
  power: Snapshot["power"],
  missionDirector: MissionDirectorResidence,
  structures: Snapshot["structures"],
): PowerNetworkSnapshot | undefined {
  if (missionDirector.residence !== "habitat") return undefined;
  const { habitatId } = missionDirector;
  const home = power.networks.find((network) =>
    network.structureIds.includes(habitatId),
  );
  if (home === undefined) return undefined;
  const sources = new Set(
    structures
      .filter(({ structureTypeId }) => isPowerSource(structureTypeId))
      .map(({ id }) => id),
  );
  const apart = power.networks.some(
    (network) =>
      network !== home && network.structureIds.some((id) => sources.has(id)),
  );
  return apart ? home : undefined;
}

/**
 * Says how much energy the Habitat's own network has stored and when it will
 * run out, for example "115.3 / 200.0 kWh" and "own network, lasts 3d 18h",
 * or "own network, lasts the Night" when it doesn't, with how full its
 * battery banks are, from 0 to 1, or undefined if it has none.
 */
export function formatHabitatNetworkPower(
  network: PowerNetworkSnapshot,
  forecast: PowerForecast,
): Stat & { readonly fraction: number | undefined } {
  const capacity = network.storageCapacityKilowattHours;
  if (capacity === 0) {
    return {
      value: "no battery banks",
      note: "own network",
      fraction: undefined,
    };
  }
  const stored = network.storedKilowattHours;
  const first = network.structureIds[0];
  const minutesUntilEmpty = forecast.networks.find(({ structureIds }) =>
    structureIds.includes(first ?? ""),
  )?.minutesUntilEmpty;
  const lasts =
    minutesUntilEmpty !== undefined
      ? `lasts ${formatShortDuration(minutesUntilEmpty)}`
      : stored > 0
        ? LASTS_THE_NIGHT
        : "empty";
  return {
    value: formatCharge(stored, capacity),
    note: `own network, ${lasts}`,
    fraction: stored / capacity,
  };
}

/**
 * Sums up the base's power for its folded section: the power to spare
 * across its networks, and how full its battery banks are if it has any,
 * for example "+9.7 kW · 78%". With the Habitat's network apart from some
 * of the base's power (see `habitatNetworkApart`), it also says how full
 * the Habitat's own battery banks are, for example "+9.7 kW · 78% ·
 * Habitat 58%".
 */
export function summarisePower(
  power: Snapshot["power"],
  habitatNetwork?: PowerNetworkSnapshot,
): string {
  const total = (pick: (network: PowerNetworkSnapshot) => number) =>
    sumNetworks(power, pick);
  const spare = powerToSpare(power);
  const capacity = total((network) => network.storageCapacityKilowattHours);
  const parts = [spare];
  if (capacity > 0) {
    const stored = total((network) => network.storedKilowattHours);
    parts.push(`${Math.round((stored / capacity) * 100)}%`);
  }
  if (habitatNetwork !== undefined) {
    const habitatCapacity = habitatNetwork.storageCapacityKilowattHours;
    parts.push(
      habitatCapacity === 0
        ? "Habitat no storage"
        : `Habitat ${Math.round((habitatNetwork.storedKilowattHours / habitatCapacity) * 100)}%`,
    );
  }
  return parts.join(" · ");
}
