export interface TryScenario {
  /** What to type after `npm run try --`. */
  readonly id: string;
  /** What state the game starts in. */
  readonly title: string;
  /** What to do, and what should happen, in words the player knows. */
  readonly steps: readonly string[];
  /** Runs on a catalogue crowded with made-up items (`crowded-catalogue.ts`). */
  readonly crowded?: boolean;
  /**
   * Left out of `try-scenarios.test.ts`, as it plays too far to prepare there:
   * another test checks the play, or CI plays it already.
   */
  readonly slow?: boolean;
  /** Prepares the Campaign, and returns it as the text of a save. */
  save(): string;
}
