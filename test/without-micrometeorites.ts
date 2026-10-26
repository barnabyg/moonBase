import type { Catalogue } from "../src/catalogue";

/**
 * The data catalogue with Micrometeorites put off for thousands of Earth
 * Days, and doing no damage when they come, for a test that counts every
 * event on the way through a Lunation or more, or needs Conditions, and
 * the forecast of spare Components, to change only as it says.
 */
export function withoutMicrometeorites(catalogue: Catalogue): Catalogue {
  return {
    ...catalogue,
    micrometeorites: {
      ...catalogue.micrometeorites,
      earthDaysBetween: { min: 10_000, max: 10_000 },
      conditionLossPercent: { min: 0, max: 0 },
    },
  };
}
