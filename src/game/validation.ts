import { getEntryIndex } from "./board";
import { createStandardDeck } from "./cards";
import { CLASSIC_PARTNERS_RULESET, RULESET_DEFINITIONS } from "./definition";
import { getWinningTeam } from "./teams";
import type { Card, GameState, RulesetId } from "./types";

export function getGameStateProblems(game: GameState): string[] {
  const problems: string[] = [];

  const ruleset = RULESET_DEFINITIONS[game.rulesetId as RulesetId] ?? CLASSIC_PARTNERS_RULESET;
  if (!RULESET_DEFINITIONS[game.rulesetId as RulesetId]) {
    problems.push("The game has an unsupported ruleset.");
  }

  if (!Number.isInteger(game.randomState) || game.randomState < 0 || game.randomState > 0xFFFFFFFF) {
    problems.push("The game has an invalid random state.");
  }
  const playerIds = game.players.map((player) => player.id);

  if (
    game.players.length !== ruleset.board.playerIds.length ||
    ruleset.board.playerIds.some((id) => playerIds.filter((candidate) => candidate === id).length !== 1)
  ) {
    problems.push(`The game must contain each player from ${ruleset.id} exactly once.`);
  }

  if (!playerIds.includes(game.currentPlayer)) {
    problems.push("The current player is not seated in the game.");
  }

  if (!playerIds.includes(game.dealer)) {
    problems.push("The dealer is not seated in the game.");
  }

  const pieces = game.players.flatMap((player) => player.pieces);
  for (const player of game.players) {
    const expectedIds = Array.from({ length: ruleset.board.piecesPerPlayer }, (_, index) => `${player.id}-${index + 1}`);
    const actualIds = player.pieces.map((piece) => piece.id);

    if (
      player.pieces.length !== ruleset.board.piecesPerPlayer ||
      player.pieces.some((piece) => piece.owner !== player.id) ||
      expectedIds.some((id) => !actualIds.includes(id))
    ) {
      problems.push(`${player.id} must own pieces ${expectedIds.join(", ")}.`);
    }
  }

  const occupiedSpaces = new Set<string>();
  for (const piece of pieces) {
    if (piece.position.zone === "reserve") continue;

    const key = piece.position.zone === "track"
      ? `track-${piece.position.index}`
      : `home-${piece.owner}-${piece.position.index}`;

    if (occupiedSpaces.has(key)) {
      problems.push(`More than one piece occupies ${key}.`);
    }
    occupiedSpaces.add(key);

    if (
      piece.position.zone === "track" &&
      (piece.position.index < 0 || piece.position.index >= ruleset.board.trackSize)
    ) {
      problems.push(`${piece.id} has an invalid track position.`);
    }

    if (
      piece.position.zone === "home" &&
      (piece.position.index < 0 || piece.position.index >= ruleset.board.homeSize)
    ) {
      problems.push(`${piece.id} has an invalid home position.`);
    }

    if (
      piece.position.zone === "track" &&
      piece.position.isEntryProtected &&
      piece.position.index !== getEntryIndex(piece.owner, ruleset.board)
    ) {
      problems.push(`${piece.id} is protected away from its entry.`);
    }
  }

  const cards = [
    ...game.players.flatMap((player) => player.hand),
    ...game.drawPile,
    ...game.discardPile,
  ];
  const expectedCards = createStandardDeck().map(cardKey).sort();
  const actualCards = cards.map(cardKey).sort();
  if (
    actualCards.length !== expectedCards.length ||
    actualCards.some((card, index) => card !== expectedCards[index])
  ) {
    problems.push("Hands, draw pile, and discard pile must contain one complete 52-card deck.");
  }

  if (game.phase === "play" && Object.keys(game.exchangeSelections).length > 0) {
    problems.push("Exchange selections must be empty during play.");
  }

  if (game.phase === "exchange" && ruleset.exchange !== "partners") {
    problems.push("A free-for-all game cannot enter the exchange phase.");
  }

  if (!Number.isInteger(game.dealIndex) || game.dealIndex < 0 || game.dealIndex >= ruleset.dealSchedule.length) {
    problems.push("The game has an invalid deal index.");
  }

  for (const [playerId, index] of Object.entries(game.exchangeSelections)) {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player || index === undefined || index < 0 || index >= player.hand.length) {
      problems.push(`${playerId} has an invalid exchange selection.`);
    }
  }

  if (game.forcedDiscardPlayer && game.forcedDiscardPlayer !== game.currentPlayer) {
    problems.push("A forced discard must belong to the current player.");
  }

  if (![0, 1, 2, 3].includes(game.charityTurns)) {
    problems.push("The game has an invalid charity setting.");
  }
  for (const [playerId, count] of Object.entries(game.charityCounts)) {
    if (!playerIds.includes(playerId as typeof game.currentPlayer) || !Number.isInteger(count) || count < 0 || count > game.charityTurns) {
      problems.push(`${playerId} has an invalid charity count.`);
    }
  }
  if (game.charityExchange) {
    if (game.charityExchange.requester !== game.currentPlayer || game.charityExchange.requester === game.charityExchange.donor) {
      problems.push("The charity exchange has invalid players.");
    }
  }

  const expectedWinner = getWinningTeam(pieces, ruleset.id);
  if (JSON.stringify(game.winningTeam) !== JSON.stringify(expectedWinner)) {
    problems.push("The recorded winner does not match the pieces at home.");
  }

  return problems;
}

export function assertValidGameState(game: GameState): void {
  const problems = getGameStateProblems(game);
  if (problems.length > 0) {
    throw new Error(`Invalid game state:\n- ${problems.join("\n- ")}`);
  }
}

function cardKey(card: Card) {
  return `${card.rank}-${card.suit}`;
}
