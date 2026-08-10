import { describe, expect, it } from "vitest";

import { createStandardDeck, nextSeededRandom, shuffleDeckWithState } from "./cards";

describe("seeded randomness", () => {
  it("produces the same sequence from the same state", () => {
    expect(nextSeededRandom(42)).toEqual(nextSeededRandom(42));
    expect(nextSeededRandom(42)).not.toEqual(nextSeededRandom(43));
  });

  it("reproduces an identical shuffled deck", () => {
    const deck = createStandardDeck();
    const first = shuffleDeckWithState(deck, 98_765);
    const second = shuffleDeckWithState(deck, 98_765);

    expect(first).toEqual(second);
    expect(first.cards).not.toEqual(deck);
  });

  it("advances the random state when shuffling", () => {
    const result = shuffleDeckWithState(createStandardDeck(), 7);

    expect(result.state).not.toBe(7);
  });
});
