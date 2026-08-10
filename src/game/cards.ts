import type { Card, CardRank, CardSuit } from "./types";

export const CARD_SUITS: readonly CardSuit[] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
];

export const CARD_RANKS: readonly CardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function createStandardDeck(): Card[] {
  return CARD_SUITS.flatMap((suit) =>
    CARD_RANKS.map((rank) => ({
      rank,
      suit,
    })),
  );
}

export function shuffleDeck(cards: readonly Card[]): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export type RandomStep = {
  value: number;
  state: number;
};

export function nextSeededRandom(state: number): RandomStep {
  const nextState = (normalizeRandomState(state) + 0x6D2B79F5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return {
    value: ((value ^ value >>> 14) >>> 0) / 4_294_967_296,
    state: nextState,
  };
}

export function shuffleDeckWithState(
  cards: readonly Card[],
  initialState: number,
): { cards: Card[]; state: number } {
  const shuffled = [...cards];
  let state = normalizeRandomState(initialState);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = nextSeededRandom(state);
    state = random.state;
    const swapIndex = Math.floor(random.value * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return { cards: shuffled, state };
}

export function createRandomState(): number {
  return Math.floor(Math.random() * 4_294_967_296) >>> 0;
}

function normalizeRandomState(state: number): number {
  if (!Number.isInteger(state) || state < 0 || state > 0xFFFFFFFF) {
    throw new RangeError("Random state must be an unsigned 32-bit integer.");
  }
  return state >>> 0;
}
