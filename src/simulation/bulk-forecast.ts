import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import { machinePerformance } from "./machines";
import { consumptionPerHour, productionPerHour } from "./plants";

/** How fast the base's stock of a bulk resource is changing, and how long it will last. */
export interface BulkResourceForecast {
  readonly resourceId: string;
  /**
   * How fast it is changing now: what the Plants make of it and the
   * excavator digs, less what the Plants use up, as they worked during the
   * latest game-minute. Negative while it is falling.
   */
  readonly kilogramsPerHour: number;
  /**
   * Game-minutes until it runs out at that rate, or undefined while it
   * isn't falling.
   */
  readonly minutesUntilEmpty: number | undefined;
}

/** Says how long each of the base's bulk resources will last, in catalogue order, as things stand. */
export function forecastBulkResources(
  state: CampaignState,
): BulkResourceForecast[] {
  return state.bulkResources.map((stock) => {
    const resource = {
      kind: "bulk-resource" as const,
      resourceId: stock.resourceId,
    };
    const dug =
      stock.resourceId === catalogue.digging.resourceId
        ? state.machines
            .filter((machine) => machine.activity.kind === "digging")
            .reduce(
              (sum, machine) =>
                sum +
                catalogue.digging.kilogramsPerWorkingHour *
                  machinePerformance(machine),
              0,
            )
        : 0;
    const perHour =
      productionPerHour(state, resource) +
      dug -
      consumptionPerHour(state, resource);
    return {
      resourceId: stock.resourceId,
      kilogramsPerHour: perHour,
      minutesUntilEmpty:
        perHour < 0 ? Math.floor((stock.kilograms / -perHour) * 60) : undefined,
    };
  });
}
