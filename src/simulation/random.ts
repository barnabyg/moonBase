/**
 * The simulation's one seeded random number generator (sfc32). Its state is
 * plain numbers, so it is part of the Campaign state and can be saved and
 * restored exactly. Nothing in the simulation may use any other source of
 * randomness.
 */
export interface RandomState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export const MAX_SEED = 2 ** 32 - 1;

export function seedRandom(seed: number): RandomState {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new RangeError(
      `A seed must be a whole number from 0 to ${MAX_SEED}, not ${seed}.`,
    );
  }
  // Expand the 32-bit seed into four words with splitmix32, then discard the
  // first outputs so that nearby seeds give unrelated sequences.
  let mix = seed >>> 0;
  const splitmix32 = (): number => {
    mix = (mix + 0x9e3779b9) >>> 0;
    let z = mix;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state = {
    a: splitmix32(),
    b: splitmix32(),
    c: splitmix32(),
    d: splitmix32(),
  };
  for (let i = 0; i < 12; i++) nextFraction(state);
  return state;
}

/** Draws the next number in [0, 1) and advances the generator. */
export function nextFraction(state: RandomState): number {
  const t = (((state.a + state.b) >>> 0) + state.d) >>> 0;
  state.d = (state.d + 1) >>> 0;
  state.a = state.b ^ (state.b >>> 9);
  state.b = (state.c + (state.c << 3)) >>> 0;
  state.c = ((state.c << 21) | (state.c >>> 11)) >>> 0;
  state.c = (state.c + t) >>> 0;
  return t / 2 ** 32;
}
