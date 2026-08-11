import { deserializeGameSnapshot, GAME_SNAPSHOT_VERSION } from "../game/persistence";
import type { GameEvent, GameSession } from "../game/session";
import { PLAYER_IDS, type PlayerId } from "../game/types";
import { parseCommandEnvelope } from "./protocol";
import type { OnlineRoom } from "./roomService";

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

  const room = record.room as OnlineRoom;
  validateRoom(room);
  return room;
}

function validateRoom(room: OnlineRoom): void {
  if (!isRecord(room) || typeof room.id !== "string" || !/^[A-Z0-9]{6}$/.test(room.id)) {
    throw new Error("The stored room has an invalid ID.");
  }
  if (!isRecord(room.seats)) throw new Error("The stored room has invalid seats.");

  for (const [playerId, tokenHash] of Object.entries(room.seats)) {
    if (!PLAYER_IDS.includes(playerId as PlayerId) || typeof tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(tokenHash)) {
      throw new Error("The stored room has an invalid seat credential.");
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
