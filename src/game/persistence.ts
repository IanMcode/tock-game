import type { GameState } from "./types";
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

  assertValidGameState(snapshot.game);
  return snapshot.game;
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
