import { applyAtomicMove } from "./actions";
import { getLegalBasicCardMoves } from "./cardMoves";
import { selectExchangeCard } from "./deals";
import { getAllPieces } from "./occupancy";
import { applySplitSevenMove } from "./specialMoves";
import {
  discardCardForTurn,
  getPlayableCardIndexes,
  playCardForTurn,
  type CardMove,
} from "./turns";
import type { GameState, Piece, PlayerId } from "./types";
import { assertValidGameState } from "./validation";

export type SimulationSummary = {
  game: GameState;
  actions: number;
  turns: number;
  completedDeals: number;
};

export function simulateGame(
  initialGame: GameState,
  actionLimit = 20_000,
): SimulationSummary {
  let game = initialGame;
  let actions = 0;
  let turns = 0;
  let completedDeals = 0;
  let previousDeal = dealKey(game);
  assertValidGameState(game);

  while (!game.winningTeam && actions < actionLimit) {
    const previousPlayer = game.currentPlayer;
    game = simulateNextAction(game);
    actions += 1;
    if (game.currentPlayer !== previousPlayer || game.phase === "exchange") turns += 1;

    const currentDeal = dealKey(game);
    if (currentDeal !== previousDeal) {
      completedDeals += 1;
      previousDeal = currentDeal;
    }
    assertValidGameState(game);
  }

  if (!game.winningTeam) {
    throw new Error(`Simulation did not finish within ${actionLimit} actions.`);
  }

  return { game, actions, turns, completedDeals };
}

export function simulateNextAction(game: GameState): GameState {
  if (game.winningTeam) return game;

  if (game.phase === "exchange") {
    const playerId = game.players.map((player) => player.id).find(
      (candidate) => game.exchangeSelections[candidate] === undefined,
    );
    if (!playerId) throw new Error("Exchange phase has no player left to select.");
    return selectExchangeCard(game, playerId, chooseExchangeIndex(game, playerId));
  }

  const player = game.players.find((candidate) => candidate.id === game.currentPlayer);
  if (!player) throw new Error(`Missing current player ${game.currentPlayer}.`);

  if (game.forcedDiscardPlayer === game.currentPlayer) {
    return discardCardForTurn(game, player.hand.length > 0 ? 0 : null);
  }

  const playableIndexes = getPlayableCardIndexes(game);
  if (playableIndexes.length === 0) {
    return discardCardForTurn(game, 0);
  }

  const cardIndex = chooseCardIndex(game, playableIndexes);
  const card = player.hand[cardIndex];
  const pieces = getAllPieces(game);
  const moves = getLegalBasicCardMoves(pieces, player.id, card, game.rulesetId, game.cardRules);
  const move = chooseMove(pieces, moves);
  return playCardForTurn(game, cardIndex, move);
}

function chooseExchangeIndex(game: GameState, playerId: PlayerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player || player.hand.length === 0) {
    throw new Error(`${playerId} cannot exchange from an empty hand.`);
  }

  const preferredIndex = player.hand.findIndex(
    (card) => card.rank !== "A" && card.rank !== "K",
  );
  return preferredIndex >= 0 ? preferredIndex : 0;
}

function chooseCardIndex(game: GameState, playableIndexes: readonly number[]) {
  const player = game.players.find((candidate) => candidate.id === game.currentPlayer)!;
  const priorities = ["A", "K", "7", "4", "Q", "10", "9", "8", "6", "3", "2", "J", "5"];

  return [...playableIndexes].sort((first, second) =>
    priorities.indexOf(player.hand[first].rank) - priorities.indexOf(player.hand[second].rank)
  )[0];
}

function chooseMove(pieces: readonly Piece[], moves: readonly CardMove[]): CardMove {
  if (moves.length === 0) throw new Error("Cannot choose from an empty move list.");

  return [...moves].sort((first, second) =>
    scoreMove(pieces, second) - scoreMove(pieces, first)
  )[0];
}

function scoreMove(pieces: readonly Piece[], move: CardMove) {
  const result = move.kind === "split7"
    ? applySplitSevenMove(pieces, move)
    : applyAtomicMove(pieces, move);
  const homeScore = result.reduce((score, piece) =>
    piece.position.zone === "home" ? score + 1_000 + piece.position.index * 20 : score,
  0);
  const reservePenalty = result.filter((piece) => piece.position.zone === "reserve").length * 10;
  const entryBonus = move.kind === "enter" ? 100 : 0;
  return homeScore - reservePenalty + entryBonus;
}

function dealKey(game: GameState) {
  return `${game.dealer}-${game.dealIndex}`;
}
