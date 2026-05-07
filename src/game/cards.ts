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
