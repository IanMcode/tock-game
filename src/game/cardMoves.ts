import { getLegalEntryMoves, type AtomicMove } from "./actions";
import { getLegalBackwardMove, getLegalForwardMoves } from "./moves";
import {
  getLegalJackMoves,
  getLegalSplitSevenMoves,
  type SplitSevenMove,
} from "./specialMoves";
import { getControlledPlayer } from "./teams";
import { getRulesetDefinition } from "./definition";
import { DEFAULT_CARD_RULE_VARIANTS, type Card, type CardRank, type CardRuleVariants, type Piece, type PlayerId, type RulesetId } from "./types";

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
  cardRules: CardRuleVariants = DEFAULT_CARD_RULE_VARIANTS,
): Array<AtomicMove | SplitSevenMove> {
  const ruleset = getRulesetDefinition(rulesetId);
  const controlledPlayerId = getControlledPlayer(pieces, playerId, rulesetId);

  switch (card.rank) {
    case "A":
      return [
        ...getLegalEntryMoves(pieces, controlledPlayerId, ruleset.board),
        ...getPlayerForwardMoves(
          pieces,
          controlledPlayerId,
          cardRules.ace === "one-only" ? [1] : [1, 11],
          ruleset.board,
        ),
      ];
    case "K":
      return [
        ...getLegalEntryMoves(pieces, controlledPlayerId, ruleset.board),
        ...getPlayerForwardMoves(
          pieces,
          controlledPlayerId,
          [13],
          ruleset.board,
          cardRules.king === "eliminate-passed",
        ),
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
      return getLegalSplitSevenMoves(
        pieces,
        controlledPlayerId,
        ruleset.board,
        cardRules.seven === "eliminate-passed",
      );
    case "J":
      return [
        ...getLegalJackMoves(pieces, controlledPlayerId),
        ...(cardRules.jack === "swap-or-eleven"
          ? getPlayerForwardMoves(pieces, controlledPlayerId, [11], ruleset.board)
          : []),
      ];
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
  eliminatePassedPieces = false,
): AtomicMove[] {
  return pieces
    .filter((piece) => piece.owner === playerId)
    .flatMap((piece) =>
      distances.flatMap((distance) =>
        getLegalForwardMoves(pieces, piece.id, distance, board, eliminatePassedPieces),
      ),
    );
}
