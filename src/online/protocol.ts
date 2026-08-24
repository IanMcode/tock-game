import type { CardMove } from "../game/turns";
import { PLAYER_IDS, type PlayerId } from "../game/types";
import type { CommandEnvelope, GameCommand } from "../game/session";
import type { BoardPlayerCount } from "../game/definition";
import type { CreateRoomOptions, StartNextGameOptions } from "./roomService";

export function parseCreateRoomOptions(value: unknown): CreateRoomOptions {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error("Room options must be an object.");

  const playerCount = value.playerCount ?? 4;
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
    throw new Error("Player count must be 2, 3, or 4.");
  }
  const teams = value.teams ?? playerCount === 4;
  if (typeof teams !== "boolean") throw new Error("Teams must be true or false.");
  if (teams && playerCount !== 4) throw new Error("Team play requires four players.");
  const randomizeSeats = value.randomizeSeats ?? false;
  if (typeof randomizeSeats !== "boolean") throw new Error("Randomize seats must be true or false.");
  const startWithPieceOnEntry = value.startWithPieceOnEntry ?? true;
  if (typeof startWithPieceOnEntry !== "boolean") {
    throw new Error("Start-with-piece-on-entry must be true or false.");
  }

  const dealer = value.dealer ?? "random";
  if (dealer !== "random") {
    const playerId = parsePlayerId(dealer);
    if (PLAYER_IDS.indexOf(playerId) >= playerCount) {
      throw new Error(`${playerId} is not seated in a ${playerCount}-player room.`);
    }
  }

  return {
    playerCount: playerCount as BoardPlayerCount,
    teams,
    dealer: dealer as PlayerId | "random",
    randomizeSeats,
    startWithPieceOnEntry,
    ...(value.playerName === undefined ? {} : { playerName: parsePlayerName(value.playerName) }),
  };
}

export function parseJoinRoomOptions(value: unknown): { playerName?: string } {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error("Join options must be an object.");
  return value.playerName === undefined ? {} : { playerName: parsePlayerName(value.playerName) };
}

export function parseStartNextGameOptions(value: unknown): StartNextGameOptions {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new Error("Next-game options must be an object.");
  const randomizeSeats = value.randomizeSeats ?? false;
  if (typeof randomizeSeats !== "boolean") throw new Error("Randomize seats must be true or false.");
  const dealer = value.dealer ?? "random";
  if (dealer !== "random") parsePlayerId(dealer);
  return { randomizeSeats, dealer: dealer as PlayerId | "random" };
}

export function parseChatMessage(value: unknown): { messageId: string; text: string } {
  if (!isRecord(value)) throw new Error("The chat message must be an object.");
  if (typeof value.messageId !== "string" || !value.messageId.trim() || value.messageId.length > 64) {
    throw new Error("The chat message ID is invalid.");
  }
  if (typeof value.text !== "string") throw new Error("The chat message must be text.");
  return { messageId: value.messageId, text: value.text };
}

function parsePlayerName(value: unknown): string {
  if (typeof value !== "string") throw new Error("The player name must be text.");
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Enter a player name.");
  if (name.length > 24) throw new Error("Player names must be 24 characters or fewer.");
  if (/\p{Cc}/u.test(name)) throw new Error("Player names cannot contain control characters.");
  return name;
}

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
