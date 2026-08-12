import type { PlayerId } from "../game/types";
import type { PublicGameEvent } from "../game/view";

export type PlayerGameStatistics = {
  playerId: PlayerId;
  jacksPlayed: number;
  outCardsPlayed: number;
  eliminations: number;
  eliminatedPlayers: Partial<Record<PlayerId, number>>;
};

export function getGameStatistics(
  events: readonly PublicGameEvent[],
  playerIds: readonly PlayerId[],
): PlayerGameStatistics[] {
  const statistics = new Map(playerIds.map((playerId) => [playerId, {
    playerId,
    jacksPlayed: 0,
    outCardsPlayed: 0,
    eliminations: 0,
    eliminatedPlayers: {} as Partial<Record<PlayerId, number>>,
  } satisfies PlayerGameStatistics]));

  for (const event of events) {
    if (event.type !== "play" || !event.card || !event.move) continue;
    const player = statistics.get(event.actor);
    if (!player) continue;
    if (event.card.rank === "J") player.jacksPlayed += 1;
    if (event.card.rank === "A" || event.card.rank === "K") player.outCardsPlayed += 1;

    for (const pieceId of capturedPieceIds(event.move)) {
      const eliminatedPlayer = pieceId.split("-")[0] as PlayerId;
      player.eliminations += 1;
      player.eliminatedPlayers[eliminatedPlayer] = (player.eliminatedPlayers[eliminatedPlayer] ?? 0) + 1;
    }
  }

  return playerIds.flatMap((playerId) => {
    const player = statistics.get(playerId);
    return player ? [player] : [];
  });
}

function capturedPieceIds(move: PublicGameEvent["move"]): string[] {
  if (!move) return [];
  if (move.kind === "split7") {
    return move.steps.flatMap((step) => step.capturedPieceId ? [step.capturedPieceId] : []);
  }
  if (move.kind === "swap" || !move.capturedPieceId) return [];
  return [move.capturedPieceId];
}
