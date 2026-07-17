import { PLAYER_IDS, type PlayerId } from "./types";

export function getNextPlayer(currentPlayer: PlayerId): PlayerId {
  const currentIndex = PLAYER_IDS.indexOf(currentPlayer);
  const nextIndex = (currentIndex + 1) % PLAYER_IDS.length;

  return PLAYER_IDS[nextIndex];
}
