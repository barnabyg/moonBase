import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { isPlannedAsItself } from "../src/simulation";
import {
  groupBuildOptions,
  summariseBuildGroup,
} from "../src/ui/build-menu-text";

const offered = catalogue.structureTypes.filter(isPlannedAsItself);
const groups = groupBuildOptions(offered);

describe("how the build menu groups the Structures it offers", () => {
  it("offers every Structure once", () => {
    expect(
      groups.flatMap((group) => group.types.map(({ id }) => id)).toSorted(),
    ).toEqual(offered.map(({ id }) => id).toSorted());
  });

  it("uses the Base panel's groups, in their order", () => {
    expect(groups.map(({ label }) => label)).toEqual(
      catalogue.structureListGroups.map(({ label }) => label),
    );
  });

  it("puts each Structure in its own group, in the catalogue's order", () => {
    for (const group of groups) {
      expect(group.types.every(({ listGroup }) => listGroup === group.id)).toBe(
        true,
      );
      expect(group.types).toEqual(
        offered.filter(({ listGroup }) => listGroup === group.id),
      );
    }
  });

  it("leaves out a group with nothing offered in it", () => {
    const solar = offered.filter(({ listGroup }) => listGroup === "power");
    expect(groupBuildOptions(solar).map(({ id }) => id)).toEqual(["power"]);
  });
});

describe("what a folded group of the build menu says", () => {
  it("counts those the base's stock can supply, and those that need no Components", () => {
    expect(
      summariseBuildGroup([
        { sets: 2, unlimited: false },
        { sets: 0, unlimited: false },
        { sets: 0, unlimited: true },
      ]),
    ).toBe("2 can be built now");
  });

  it("says when none can", () => {
    expect(
      summariseBuildGroup([
        { sets: 0, unlimited: false },
        { sets: 0, unlimited: false },
      ]),
    ).toBe("none can be built now");
  });

  it("says when all can", () => {
    expect(
      summariseBuildGroup([
        { sets: 1, unlimited: false },
        { sets: 3, unlimited: false },
      ]),
    ).toBe("all can be built now");
  });
});
