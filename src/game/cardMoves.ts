import { getLegalEntryMoves, type AtomicMove } from "./actions";
import { getLegalBackwardMove, getLegalForwardMoves } from "./moves";
import {
  getLegalJackMoves,
  getLegalSplitSevenMoves,
  type SplitSevenMove,
} from "./specialMoves";
import { getControlledPlayer } from "./teams";
import { getRulesetDefinition } from "./definition";
import type { Card, CardRank, Piece, PlayerId, RulesetId } from "./types";

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
  rulesetId: RulesetId = "classic-partners-4",
): Array<AtomicMove | SplitSevenMove> {
  const ruleset = getRulesetDefinition(rulesetId);
  const controlledPlayerId = getControlledPlayer(pieces, playerId, rulesetId);

  switch (card.rank) {
    case "A":
      return [
        ...getLegalEntryMoves(pieces, controlledPlayerId, ruleset.board),
        ...getPlayerForwardMoves(pieces, controlledPlayerId, [1, 11], ruleset.board),
      ];
    case "K":
      return [
        ...getLegalEntryMoves(pieces, controlledPlayerId, ruleset.board),
        ...getPlayerForwardMoves(pieces, controlledPlayerId, [13], ruleset.board),
      ];
    case "4":
      return pieces
        .filter((piece) => piece.owner === controlledPlayerId)
        .flatMap((piece) => getLegalBackwardMove(pieces, piece.id, 4, ruleset.board));
    case "5":
      return pieces
        .filter((piece) => piece.position.zone === "track")
        .flatMap((piece) => getLegalForwardMoves(pieces, piece.id, 5, ruleset.board));
    case "7":
      return getLegalSplitSevenMoves(pieces, controlledPlayerId, ruleset.board);
    case "J":
      return getLegalJackMoves(pieces, controlledPlayerId);
    case "2":
    case "3":
    case "6":
    case "8":
    case "9":
    case "10":
    case "Q":
      return getPlayerForwardMoves(
        pieces,
        controlledPlayerId,
        FORWARD_DISTANCES[card.rank],
        ruleset.board,
      );
  }
}

function getPlayerForwardMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  distances: readonly number[],
  board?: import("./definition").BoardDefinition,
): AtomicMove[] {
  return pieces
    .filter((piece) => piece.owner === playerId)
    .flatMap((piece) =>
      distances.flatMap((distance) =>
        getLegalForwardMoves(pieces, piece.id, distance, board),
      ),
    );
}
