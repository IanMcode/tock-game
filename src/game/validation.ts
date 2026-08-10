import { getEntryIndex, HOME_SIZE, TRACK_SIZE } from "./board";
import { createStandardDeck } from "./cards";
import { PLAYER_IDS, type Card, type GameState } from "./types";

export function getGameStateProblems(game: GameState): string[] {
  const problems: string[] = [];
  const playerIds = game.players.map((player) => player.id);

  if (
    game.players.length !== PLAYER_IDS.length ||
    PLAYER_IDS.some((id) => playerIds.filter((candidate) => candidate === id).length !== 1)
  ) {
    problems.push("The game must contain each of the four players exactly once.");
  }

  const pieces = game.players.flatMap((player) => player.pieces);
  for (const player of game.players) {
    const expectedIds = Array.from({ length: 4 }, (_, index) => `${player.id}-${index + 1}`);
    const actualIds = player.pieces.map((piece) => piece.id);

    if (
      player.pieces.length !== 4 ||
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
      (piece.position.index < 0 || piece.position.index >= TRACK_SIZE)
    ) {
      problems.push(`${piece.id} has an invalid track position.`);
    }

    if (
      piece.position.zone === "home" &&
      (piece.position.index < 0 || piece.position.index >= HOME_SIZE)
    ) {
      problems.push(`${piece.id} has an invalid home position.`);
    }

    if (
      piece.position.zone === "track" &&
      piece.position.isEntryProtected &&
      piece.position.index !== getEntryIndex(piece.owner)
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

  for (const [playerId, index] of Object.entries(game.exchangeSelections)) {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player || index === undefined || index < 0 || index >= player.hand.length) {
      problems.push(`${playerId} has an invalid exchange selection.`);
    }
  }

  if (game.forcedDiscardPlayer && game.forcedDiscardPlayer !== game.currentPlayer) {
    problems.push("A forced discard must belong to the current player.");
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
