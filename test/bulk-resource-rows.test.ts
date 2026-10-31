import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { formatBulkResources } from "../src/ui/status-panel-text";
import { toGameMinutes } from "./scenario";

/** The row for one bulk resource, as the status panel shows it. */
function row(
  kilograms: number,
  kilogramsPerHour: number,
  minutesUntilEmpty: number | undefined,
) {
  const [shown] = formatBulkResources(
    [{ resourceId: "silicon", kilograms }],
    [{ resourceId: "silicon", kilogramsPerHour, minutesUntilEmpty }],
  );
  if (shown === undefined) throw new Error("expected a row");
  return shown;
}

describe("a bulk resource's row in the status panel", () => {
  const warnFrom = catalogue.bulkResourceWarningEarthDaysLeft * 24 * 60;

  it("shows its stock, how fast it is changing and how long it lasts", () => {
    expect(row(30, -0.5, toGameMinutes({ earthDays: 2, hours: 12 }))).toEqual({
      label: "Silicon",
      value: "30 kg",
      note: "−12.0 kg/day, ~2d",
      empty: false,
      warning: true,
      inPlay: true,
    });
  });

  it("is a warning only once what is falling is about to run out", () => {
    expect(row(30, -0.5, warnFrom).warning).toBe(true);
    expect(row(30, -0.5, warnFrom + 1).warning).toBe(false);
    expect(row(30, 0.5, undefined).warning).toBe(false);
  });

  it("is no warning once there is none, as nothing may want it", () => {
    expect(row(0, -0.5, 0).warning).toBe(false);
    expect(row(0, 0, undefined).warning).toBe(false);
  });

  it("is in play while any is in stock, or being made or used", () => {
    expect(row(0.2, 0, undefined).inPlay).toBe(true);
    expect(row(0, 0.5, undefined).inPlay).toBe(true);
    expect(row(0, -0.5, 0).inPlay).toBe(true);
    expect(row(0, 0, undefined).inPlay).toBe(false);
  });
});
