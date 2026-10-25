import {
  createCampaign,
  type Campaign,
  type Snapshot,
} from "../src/simulation";

/** A span of game time, written the way a game situation reads. */
export interface Duration {
  readonly earthDays?: number;
  readonly hours?: number;
  readonly minutes?: number;
}

export const DEFAULT_SEED = 20261025;

export function toGameMinutes(duration: Duration): number {
  return (
    (duration.earthDays ?? 0) * 24 * 60 +
    (duration.hours ?? 0) * 60 +
    (duration.minutes ?? 0)
  );
}

export interface Scenario {
  readonly campaign: Campaign;
  advance(duration: Duration): Scenario;
  readonly state: Snapshot;
}

/** Starts a Campaign for a scenario test: given a seed, advance time, then read the state. */
export function scenario(seed: number = DEFAULT_SEED): Scenario {
  const campaign = createCampaign({ seed });
  const self: Scenario = {
    campaign,
    advance(duration) {
      campaign.advance(toGameMinutes(duration));
      return self;
    },
    get state() {
      return campaign.snapshot();
    },
  };
  return self;
}
