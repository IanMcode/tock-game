import { deserializeGameSnapshot, GAME_SNAPSHOT_VERSION } from "../game/persistence";
import type { GameEvent, GameSession } from "../game/session";
import { PLAYER_IDS, type PlayerId } from "../game/types";
import { parseCommandEnvelope } from "./protocol";
import { DEFAULT_PLAYER_NAMES, type OnlineRoom } from "./roomService";

export const ROOM_RECORD_VERSION = 1 as const;

type RoomRecord = {
  version: typeof ROOM_RECORD_VERSION;
  room: OnlineRoom;
};

export function serializeOnlineRoom(room: OnlineRoom): string {
  validateRoom(room);
  return JSON.stringify({ version: ROOM_RECORD_VERSION, room } satisfies RoomRecord);
}

export function deserializeOnlineRoom(value: unknown): OnlineRoom {
  const record = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(record) || record.version !== ROOM_RECORD_VERSION || !isRecord(record.room)) {
    throw new Error("The stored room record version is not supported.");
  }

  const storedRoom = record.room as OnlineRoom;
  const room = {
    ...storedRoom,
    playerNames: isRecord(storedRoom.playerNames)
      ? storedRoom.playerNames
      : Object.fromEntries(
          PLAYER_IDS.filter((playerId) => Boolean(storedRoom.seats?.[playerId]))
            .map((playerId) => [playerId, DEFAULT_PLAYER_NAMES[playerId]]),
        ),
  } as OnlineRoom;
  validateRoom(room);
  return room;
}

function validateRoom(room: OnlineRoom): void {
  if (!isRecord(room) || typeof room.id !== "string" || !/^[A-Z0-9]{6}$/.test(room.id)) {
    throw new Error("The stored room has an invalid ID.");
  }
  if (!isRecord(room.seats)) throw new Error("The stored room has invalid seats.");
  if (!isRecord(room.playerNames)) throw new Error("The stored room has invalid player names.");

  for (const [playerId, tokenHash] of Object.entries(room.seats)) {
    if (!PLAYER_IDS.includes(playerId as PlayerId) || typeof tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(tokenHash)) {
      throw new Error("The stored room has an invalid seat credential.");
    }
  }

  for (const [playerId, playerName] of Object.entries(room.playerNames)) {
    if (
      !PLAYER_IDS.includes(playerId as PlayerId) ||
      !room.seats[playerId as PlayerId] ||
      typeof playerName !== "string" ||
      !playerName.trim() ||
      playerName.length > 24
    ) {
      throw new Error("The stored room has an invalid player name.");
    }
  }

  if (!isRecord(room.session)) throw new Error("The stored room has an invalid session.");
  const session = room.session as GameSession;
  if (
    session.id !== room.id ||
    !Number.isSafeInteger(session.revision) ||
    session.revision < 0 ||
    !Array.isArray(session.events) ||
    session.events.length !== session.revision
  ) {
    throw new Error("The stored room has an invalid session history.");
  }

  deserializeGameSnapshot(JSON.stringify({
    version: GAME_SNAPSHOT_VERSION,
    game: session.game,
  }));

  session.events.forEach((event, index) => validateEvent(event, index + 1));
}

function validateEvent(value: unknown, expectedRevision: number): asserts value is GameEvent {
  if (!isRecord(value) || value.revision !== expectedRevision || typeof value.commandId !== "string") {
    throw new Error("The stored room has an invalid command history.");
  }
  parseCommandEnvelope({
    commandId: value.commandId,
    expectedRevision: expectedRevision - 1,
    command: value.command,
  });
  if ("card" in value && value.card !== null) {
    if (
      !isRecord(value.card) ||
      typeof value.card.rank !== "string" ||
      typeof value.card.suit !== "string"
    ) {
      throw new Error("The stored room has an invalid played card.");
    }
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("The stored room record is not valid JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
