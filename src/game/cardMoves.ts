import { getLegalEntryMoves, type AtomicMove } from "./actions";
import { getLegalBackwardMove, getLegalForwardMoves } from "./moves";
import {
  getLegalJackMoves,
  getLegalSplitSevenMoves,
  type SplitSevenMove,
} from "./specialMoves";
import type { Card, CardRank, Piece, PlayerId } from "./types";

const FORWARD_DISTANCES = {
  "2": [2],
  "3": [3],
  "6": [6],
  "8": [8],
  "9": [9],
  "10": [10],
  Q: [12],
} as const satisfies Partial<Record<CardRank, readonly number[]>>;

export function getLegalBasicCardMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  card: Card,
): Array<AtomicMove | SplitSevenMove> {
  switch (card.rank) {
    case "A":
      return [
        ...getLegalEntryMoves(pieces, playerId),
        ...getPlayerForwardMoves(pieces, playerId, [1, 11]),
      ];
    case "K":
      return [
        ...getLegalEntryMoves(pieces, playerId),
        ...getPlayerForwardMoves(pieces, playerId, [13]),
      ];
    case "4":
      return pieces
        .filter((piece) => piece.owner === playerId)
        .flatMap((piece) => getLegalBackwardMove(pieces, piece.id, 4));
    case "5":
      return pieces
        .filter((piece) => piece.position.zone === "track")
        .flatMap((piece) => getLegalForwardMoves(pieces, piece.id, 5));
    case "7":
      return getLegalSplitSevenMoves(pieces, playerId);
    case "J":
      return getLegalJackMoves(pieces, playerId);
    case "2":
    case "3":
    case "6":
    case "8":
    case "9":
    case "10":
    case "Q":
      return getPlayerForwardMoves(
        pieces,
        playerId,
        FORWARD_DISTANCES[card.rank],
      );
  }
}

function getPlayerForwardMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  distances: readonly number[],
): AtomicMove[] {
  return pieces
    .filter((piece) => piece.owner === playerId)
    .flatMap((piece) =>
      distances.flatMap((distance) =>
        getLegalForwardMoves(pieces, piece.id, distance),
      ),
    );
}
