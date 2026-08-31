import { applyAtomicMove, type AtomicMove } from "./actions";
import { isCharityRequestRequired, updateCharityEligibilityAfterTurn } from "./charity";
import { getLegalBasicCardMoves } from "./cardMoves";
import { advanceDealIfHandComplete } from "./deals";
import { getAllPieces } from "./occupancy";
import {
  applySplitSevenMove,
  type SplitSevenMove,
} from "./specialMoves";
import { getWinningTeam } from "./teams";
import { getNextPlayer } from "./rules";
import type { Card, GameState, Piece } from "./types";

export type CardMove = AtomicMove | SplitSevenMove;

export function playCardForTurn(
  game: GameState,
  cardIndex: number,
  selectedMove: CardMove,
): GameState {
  assertGameIsActive(game);

  if (isCharityRequestRequired(game) || game.charityExchange) {
    throw new Error("The charity card exchange must be completed before moving.");
  }

  if (game.forcedDiscardPlayer === game.currentPlayer) {
    throw new Error("The current player must discard without moving.");
  }

  const player = getCurrentPlayer(game);
  const card = getCardAtIndex(player.hand, cardIndex);
  const pieces = getAllPieces(game);
  const legalMoves = getLegalBasicCardMoves(pieces, player.id, card, game.rulesetId);
  const legalMove = legalMoves.find(
    (candidate) => serializeMove(candidate) === serializeMove(selectedMove),
  );

  if (!legalMove) {
    throw new Error("The selected move is not legal for that card.");
  }

  const movedPieces =
    legalMove.kind === "split7"
      ? applySplitSevenMove(pieces, legalMove)
      : applyAtomicMove(pieces, legalMove);

  return finishTurn(game, cardIndex, card, movedPieces);
}

export function discardCardForTurn(
  game: GameState,
  cardIndex: number | null,
): GameState {
  assertGameIsActive(game);
  if (isCharityRequestRequired(game) || game.charityExchange) {
    throw new Error("The charity card exchange must be completed before discarding.");
  }
  const player = getCurrentPlayer(game);
  const isForcedDiscard = game.forcedDiscardPlayer === player.id;

  if (player.hand.length === 0) {
    if (!isForcedDiscard || cardIndex !== null) {
      throw new Error("The current player has no card to discard.");
    }

    return advanceTurn(game, null, null, getAllPieces(game));
  }

  if (cardIndex === null) {
    throw new Error("A card must be selected for discard.");
  }

  const card = getCardAtIndex(player.hand, cardIndex);

  if (!isForcedDiscard && !canDiscardVoluntarily(game, cardIndex)) {
    throw new Error("The current player has a legal card move and cannot discard.");
  }

  return advanceTurn(game, cardIndex, card, getAllPieces(game));
}

export function getPlayableCardIndexes(game: GameState): number[] {
  if (
    game.phase !== "play" ||
    game.winningTeam ||
    game.forcedDiscardPlayer === game.currentPlayer
  ) {
    return [];
  }

  const player = getCurrentPlayer(game);
  const pieces = getAllPieces(game);

  return player.hand.flatMap((card, index) =>
    getLegalBasicCardMoves(pieces, player.id, card, game.rulesetId).length > 0 ? [index] : [],
  );
}

function canDiscardVoluntarily(game: GameState, cardIndex: number): boolean {
  const player = getCurrentPlayer(game);
  const playableIndexes = getPlayableCardIndexes(game);

  if (playableIndexes.length === 0) {
    return true;
  }

  const onlyFivesArePlayable = playableIndexes.every(
    (index) => player.hand[index].rank === "5",
  );

  return onlyFivesArePlayable && player.hand[cardIndex].rank !== "5";
}

function finishTurn(
  game: GameState,
  cardIndex: number,
  card: Card,
  pieces: readonly Piece[],
): GameState {
  return advanceTurn(game, cardIndex, card, pieces);
}

function advanceTurn(
  game: GameState,
  cardIndex: number | null,
  discardedCard: Card | null,
  pieces: readonly Piece[],
): GameState {
  const nextPlayer = getNextPlayer(
    game.currentPlayer,
    game.players.map((player) => player.id),
  );
  const players = game.players.map((player) => ({
    ...player,
    hand:
      player.id === game.currentPlayer && cardIndex !== null
        ? player.hand.filter((_, index) => index !== cardIndex)
        : player.hand,
    pieces: player.pieces.map(
      (piece) => pieces.find((candidate) => candidate.id === piece.id) ?? piece,
    ),
  }));

  const nextGame = {
    ...game,
    players,
    currentPlayer: nextPlayer,
    discardPile: discardedCard
      ? [...game.discardPile, discardedCard]
      : game.discardPile,
    forcedDiscardPlayer: discardedCard?.rank === "10" ? nextPlayer : null,
    winningTeam: getWinningTeam(pieces, game.rulesetId),
    charityHandEligible: updateCharityEligibilityAfterTurn(game),
  };

  return advanceDealIfHandComplete(nextGame);
}

function getCurrentPlayer(game: GameState) {
  const player = game.players.find(({ id }) => id === game.currentPlayer);

  if (!player) {
    throw new Error(`Current player ${game.currentPlayer} is missing.`);
  }

  return player;
}

function getCardAtIndex(hand: readonly Card[], cardIndex: number): Card {
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= hand.length) {
    throw new RangeError("Card index is outside the current player's hand.");
  }

  return hand[cardIndex];
}

function assertGameIsActive(game: GameState): void {
  if (game.winningTeam) {
    throw new Error("The game has already ended.");
  }

  if (game.phase !== "play") {
    throw new Error("Cards cannot be played before the partner exchange.");
  }
}

function serializeMove(move: CardMove): string {
  return JSON.stringify(move);
}
