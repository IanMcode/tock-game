import { PLAYER_IDS, type Card, type CardMoveValue, type PlayerId } from "./types";

export function getNextPlayer(currentPlayer: PlayerId): PlayerId {
  const currentIndex = PLAYER_IDS.indexOf(currentPlayer);
  const nextIndex = (currentIndex + 1) % PLAYER_IDS.length;

  return PLAYER_IDS[nextIndex];
}

export function getCardMoveValue(card: Card): CardMoveValue {
  switch (card.rank) {
    case "A":
    case "K":
      return "start";
    case "J":
      return "swap";
    case "7":
      return "split7";
    case "Q":
      return 12;
    default:
      return Number(card.rank);
  }
}
