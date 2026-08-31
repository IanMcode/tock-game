import { DEFAULT_CARD_RULE_VARIANTS, type GameState } from "./types";
import { assertValidGameState } from "./validation";

export const GAME_SNAPSHOT_VERSION = 2 as const;

export type GameSnapshot = {
  version: typeof GAME_SNAPSHOT_VERSION;
  game: GameState;
};

export function serializeGameSnapshot(game: GameState): string {
  assertValidGameState(game);
  return JSON.stringify({ version: GAME_SNAPSHOT_VERSION, game } satisfies GameSnapshot);
}

export function deserializeGameSnapshot(serialized: string): GameState {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(serialized);
  } catch {
    throw new Error("The game snapshot is not valid JSON.");
  }

  if (!isRecord(snapshot) || snapshot.version !== GAME_SNAPSHOT_VERSION) {
    throw new Error("The game snapshot version is not supported.");
  }

  if (!hasGameStateStructure(snapshot.game)) {
    throw new Error("The game snapshot does not contain a complete game state.");
  }

  const game = {
    ...snapshot.game,
    charityTurns: snapshot.game.charityTurns ?? 0,
    charityRepeatAtThreshold: snapshot.game.charityRepeatAtThreshold ?? false,
    cardRules: { ...DEFAULT_CARD_RULE_VARIANTS, ...snapshot.game.cardRules },
    charityCounts: snapshot.game.charityCounts ?? {},
    charityHandEligible: snapshot.game.charityHandEligible ?? Object.fromEntries(
      snapshot.game.players.map((player) => [player.id, true]),
    ),
    charityRequestQueue: snapshot.game.charityRequestQueue ?? [],
    charityRequestIndex: snapshot.game.charityRequestIndex ?? 0,
    charityExchange: snapshot.game.charityExchange ?? null,
    lastCharityTransfer: snapshot.game.lastCharityTransfer ?? null,
  };
  assertValidGameState(game);
  return game;
}

function hasGameStateStructure(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.players) || !Array.isArray(value.drawPile) || !Array.isArray(value.discardPile)) {
    return false;
  }
  if (!isRecord(value.exchangeSelections)) return false;

  return value.players.every((player) =>
    isRecord(player) &&
    typeof player.id === "string" &&
    Array.isArray(player.hand) &&
    Array.isArray(player.pieces),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
