import { deserializeGameSnapshot, GAME_SNAPSHOT_VERSION } from "../game/persistence";
import type { GameEvent, GameSession } from "../game/session";
import { DEFAULT_CARD_RULE_VARIANTS, PLAYER_IDS, type PlayerId } from "../game/types";
import { getRulesetDefinition } from "../game/definition";
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
  const legacySession = storedRoom.session as GameSession;
  const storedSession = {
    ...legacySession,
    game: {
      ...legacySession.game,
      charityTurns: legacySession.game.charityTurns ?? 0,
      charityRepeatAtThreshold: legacySession.game.charityRepeatAtThreshold ?? false,
      cardRules: { ...DEFAULT_CARD_RULE_VARIANTS, ...legacySession.game.cardRules },
      charityCounts: legacySession.game.charityCounts ?? {},
      charityHandEligible: legacySession.game.charityHandEligible ?? Object.fromEntries(
        legacySession.game.players.map((player) => [player.id, true]),
      ),
      charityRequestQueue: legacySession.game.charityRequestQueue ?? [],
      charityRequestIndex: legacySession.game.charityRequestIndex ?? 0,
      charityExchange: legacySession.game.charityExchange ?? null,
      lastCharityTransfer: legacySession.game.lastCharityTransfer ?? null,
    },
  } satisfies GameSession;
  const ruleset = getRulesetDefinition(storedSession.game.rulesetId);
  const room = {
    ...storedRoom,
    session: storedSession,
    started: typeof storedRoom.started === "boolean"
      ? storedRoom.started
      : storedSession.game.players.every((player) => Boolean(storedRoom.seats?.[player.id])),
    chatMessages: Array.isArray(storedRoom.chatMessages) ? storedRoom.chatMessages : [],
    playerNames: isRecord(storedRoom.playerNames)
      ? storedRoom.playerNames
      : Object.fromEntries(
          PLAYER_IDS.filter((playerId) => Boolean(storedRoom.seats?.[playerId]))
            .map((playerId) => [playerId, DEFAULT_PLAYER_NAMES[playerId]]),
        ),
    participantIds: isRecord(storedRoom.participantIds)
      ? storedRoom.participantIds
      : Object.fromEntries(
          storedSession.game.players.map((player) => [player.id, `player-${player.id}`]),
        ),
    hostParticipantId: typeof storedRoom.hostParticipantId === "string"
      ? storedRoom.hostParticipantId
      : participantIdForLegacyHost(storedRoom, storedSession),
    matchHistory: Array.isArray(storedRoom.matchHistory) ? storedRoom.matchHistory : [],
    currentGameNumber: Number.isSafeInteger(storedRoom.currentGameNumber) && Number(storedRoom.currentGameNumber) > 0
      ? storedRoom.currentGameNumber
      : 1,
    configuration: isRecord(storedRoom.configuration)
      ? {
          ...storedRoom.configuration,
          charityTurns: storedRoom.configuration.charityTurns ?? 0,
          charityRepeatAtThreshold: storedRoom.configuration.charityRepeatAtThreshold ?? false,
          cardRules: { ...DEFAULT_CARD_RULE_VARIANTS, ...storedRoom.configuration.cardRules },
        }
      : {
          teams: ruleset.exchange === "partners",
          startWithPieceOnEntry: true,
          charityTurns: 0,
          charityRepeatAtThreshold: false,
          cardRules: { ...DEFAULT_CARD_RULE_VARIANTS },
        },
  } as OnlineRoom;
  validateRoom(room);
  return room;
}

function validateRoom(room: OnlineRoom): void {
  if (!isRecord(room) || typeof room.id !== "string" || !/^\d{4}$/.test(room.id)) {
    throw new Error("The stored room has an invalid ID.");
  }
  if (!isRecord(room.session)) throw new Error("The stored room has an invalid session.");
  const session = room.session as GameSession;
  if (!isRecord(session.game)) throw new Error("The stored room has an invalid game.");
  if (!isRecord(room.seats)) throw new Error("The stored room has invalid seats.");
  if (!isRecord(room.playerNames)) throw new Error("The stored room has invalid player names.");
  if (!isRecord(room.participantIds)) throw new Error("The stored room has invalid match participants.");
  if (typeof room.started !== "boolean") throw new Error("The stored room has an invalid started state.");
  if (
    typeof room.hostParticipantId !== "string" ||
    !Object.values(room.participantIds).includes(room.hostParticipantId)
  ) {
    throw new Error("The stored room has an invalid host.");
  }
  if (!Array.isArray(room.matchHistory)) throw new Error("The stored room has invalid match history.");
  if (!Number.isSafeInteger(room.currentGameNumber) || Number(room.currentGameNumber) < 1) {
    throw new Error("The stored room has an invalid game number.");
  }
  if (
    !isRecord(room.configuration) ||
    typeof room.configuration.teams !== "boolean" ||
    typeof room.configuration.startWithPieceOnEntry !== "boolean" ||
    typeof room.configuration.charityRepeatAtThreshold !== "boolean" ||
    ![0, 1, 2, 3].includes(room.configuration.charityTurns) ||
    !isValidCardRules(room.configuration.cardRules)
  ) {
    throw new Error("The stored room has invalid game configuration.");
  }
  if (room.rematchVote !== undefined && room.rematchVote !== null) {
    const vote = room.rematchVote;
    if (
      !PLAYER_IDS.includes(vote.requestedBy) ||
      !isRecord(vote.votes) ||
      !isRecord(vote.options) ||
      typeof vote.options.randomizeSeats !== "boolean" ||
      (vote.options.dealer !== "random" && !PLAYER_IDS.includes(vote.options.dealer)) ||
      Object.entries(vote.votes).some(([playerId, choice]) =>
        !PLAYER_IDS.includes(playerId as PlayerId) || (choice !== "accepted" && choice !== "declined"))
    ) {
      throw new Error("The stored room has an invalid rematch vote.");
    }
  }
  if (room.joinOrder !== undefined && (
    !Array.isArray(room.joinOrder) ||
    room.joinOrder.length !== session.game.players.length ||
    new Set(room.joinOrder).size !== room.joinOrder.length ||
    room.joinOrder.some((playerId) => !session.game.players.some((player) => player.id === playerId))
  )) {
    throw new Error("The stored room has an invalid join order.");
  }
  if (!Array.isArray(room.chatMessages) || room.chatMessages.length > 50) {
    throw new Error("The stored room has invalid chat history.");
  }

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

  for (const player of session.game.players) {
    const participantId = room.participantIds?.[player.id];
    if (typeof participantId !== "string" || !participantId || participantId.length > 64) {
      throw new Error("The stored room has an invalid match participant.");
    }
  }

  for (const game of room.matchHistory ?? []) validateMatchGame(game);

  for (const message of room.chatMessages) {
    if (
      !isRecord(message) ||
      typeof message.id !== "string" ||
      !message.id ||
      message.id.length > 64 ||
      !PLAYER_IDS.includes(message.playerId as PlayerId) ||
      !room.seats[message.playerId as PlayerId] ||
      typeof message.text !== "string" ||
      !message.text.trim() ||
      message.text.length > 200 ||
      !Number.isSafeInteger(message.sentAt) ||
      (message.sentAt as number) < 0
    ) {
      throw new Error("The stored room has an invalid chat message.");
    }
  }

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

function isValidCardRules(value: unknown): boolean {
  return isRecord(value) &&
    (value.ace === "one-or-eleven" || value.ace === "one-only") &&
    (value.king === "land-only" || value.king === "eliminate-passed") &&
    (value.jack === "swap-only" || value.jack === "swap-or-eleven") &&
    (value.seven === "land-only" || value.seven === "eliminate-passed");
}

function participantIdForLegacyHost(room: OnlineRoom, session: GameSession): string {
  const hostSeat = room.joinOrder?.[0] ?? session.game.players[0]?.id ?? "P1";
  const participantId = room.participantIds?.[hostSeat];
  return typeof participantId === "string" ? participantId : `player-${hostSeat}`;
}

function validateMatchGame(value: unknown): void {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.gameNumber) ||
    Number(value.gameNumber) < 1 ||
    !Number.isSafeInteger(value.completedAt) ||
    Number(value.completedAt) < 0 ||
    !Array.isArray(value.winnerParticipantIds) ||
    value.winnerParticipantIds.some((participantId) => typeof participantId !== "string" || !participantId) ||
    !Array.isArray(value.players)
  ) {
    throw new Error("The stored room has an invalid match game.");
  }
  for (const player of value.players) {
    if (
      !isRecord(player) ||
      typeof player.participantId !== "string" ||
      typeof player.playerName !== "string" ||
      !PLAYER_IDS.includes(player.seatId as PlayerId) ||
      player.playerId !== player.seatId ||
      !Number.isSafeInteger(player.jacksPlayed) ||
      !Number.isSafeInteger(player.outCardsPlayed) ||
      !Number.isSafeInteger(player.eliminations) ||
      !isRecord(player.eliminatedPlayers)
    ) {
      throw new Error("The stored room has invalid match statistics.");
    }
  }
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
  if (
    "movedPieces" in value &&
    (!Array.isArray(value.movedPieces) || value.movedPieces.some((detail) =>
      !isRecord(detail) ||
      typeof detail.pieceId !== "string" ||
      !Number.isInteger(detail.spaces) ||
      Number(detail.spaces) < 0
    ))
  ) {
    throw new Error("The stored room has invalid movement details.");
  }
  if (
    "piecePositionsBefore" in value &&
    (!Array.isArray(value.piecePositionsBefore) || value.piecePositionsBefore.some((detail) =>
      !isRecord(detail) ||
      typeof detail.pieceId !== "string" ||
      !isPiecePosition(detail.position)
    ))
  ) {
    throw new Error("The stored room has invalid replay positions.");
  }
  if ("startsNewDealerRound" in value && value.startsNewDealerRound !== true) {
    throw new Error("The stored room has an invalid dealer-round marker.");
  }
}

function isPiecePosition(value: unknown): boolean {
  if (!isRecord(value) || typeof value.zone !== "string") return false;
  if (value.zone === "reserve") return true;
  if (value.zone === "home") return Number.isInteger(value.index) && Number(value.index) >= 0;
  return value.zone === "track" &&
    Number.isInteger(value.index) &&
    Number(value.index) >= 0 &&
    typeof value.isEntryProtected === "boolean";
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
