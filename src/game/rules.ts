import { PLAYER_IDS, type PlayerId } from "./types";

export function getNextPlayer(
  currentPlayer: PlayerId,
  playerIds: readonly PlayerId[] = PLAYER_IDS,
): PlayerId {
  const currentIndex = playerIds.indexOf(currentPlayer);
  if (currentIndex < 0) throw new Error(`${currentPlayer} is not in the turn order.`);
  const nextIndex = (currentIndex + 1) % playerIds.length;

  return playerIds[nextIndex];
}
