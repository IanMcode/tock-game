import type { Card } from "../game/types";

export function findReceivedExchangeCard(
  handBefore: readonly Card[],
  handAfter: readonly Card[],
  sent: Card,
): Card | null {
  const retainedCards = handBefore.filter((card) => !sameCard(card, sent));
  return handAfter.find((card) => !retainedCards.some((retained) => sameCard(retained, card))) ?? null;
}

function sameCard(left: Card, right: Card) {
  return left.rank === right.rank && left.suit === right.suit;
}
