import type { CardMove } from "../game/turns";
import { PLAYER_IDS, type PlayerId } from "../game/types";
import type { CommandEnvelope, GameCommand } from "../game/session";

export function parseCommandEnvelope(value: unknown): CommandEnvelope {
  if (!isRecord(value)) throw new Error("The command envelope must be an object.");
  if (typeof value.commandId !== "string") throw new Error("The command ID must be a string.");
  if (!Number.isSafeInteger(value.expectedRevision)) {
    throw new Error("The expected revision must be an integer.");
  }

  return {
    commandId: value.commandId,
    expectedRevision: value.expectedRevision as number,
    command: parseGameCommand(value.command),
  };
}

function parseGameCommand(value: unknown): GameCommand {
  if (!isRecord(value)) throw new Error("The game command must be an object.");
  const actor = parsePlayerId(value.actor);

  switch (value.type) {
    case "select-exchange-card":
      return {
        type: value.type,
        actor,
        cardIndex: parseCardIndex(value.cardIndex, false),
      };
    case "discard-card":
      return {
        type: value.type,
        actor,
        cardIndex: parseCardIndex(value.cardIndex, true),
      };
    case "play-card":
      if (!isRecord(value.move)) throw new Error("A play command requires a move object.");
      return {
        type: value.type,
        actor,
        cardIndex: parseCardIndex(value.cardIndex, false),
        move: value.move as CardMove,
      };
    default:
      throw new Error("The game command type is not supported.");
  }
}

function parseCardIndex(value: unknown, nullable: false): number;
function parseCardIndex(value: unknown, nullable: true): number | null;
function parseCardIndex(value: unknown, nullable: boolean): number | null {
  if (nullable && value === null) return null;
  if (!Number.isInteger(value)) throw new Error("The card index must be an integer or null.");
  return value as number;
}

function parsePlayerId(value: unknown): PlayerId {
  if (typeof value !== "string" || !PLAYER_IDS.includes(value as PlayerId)) {
    throw new Error("The command actor is not a valid player.");
  }
  return value as PlayerId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
