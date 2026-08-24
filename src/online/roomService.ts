import { createRandomState } from "../game/cards";
import { createGame } from "../game/createGame";
import type { BoardPlayerCount } from "../game/definition";
import {
  applySessionCommand,
  createGameSession,
  SessionCommandError,
  type CommandEnvelope,
  type GameSession,
} from "../game/session";
import { PLAYER_IDS, type PlayerId } from "../game/types";
import { createSessionView, type GameSessionView } from "../game/view";
import { getRulesetDefinition } from "../game/definition";
import { getGameStatistics, type PlayerGameStatistics } from "./statistics";

export type RoomStatus = "waiting" | "active" | "complete";

export type ChatMessage = {
  id: string;
  playerId: PlayerId;
  text: string;
  sentAt: number;
};

export type OnlineRoom = {
  id: string;
  seats: Partial<Record<PlayerId, string>>;
  joinOrder?: PlayerId[];
  playerNames: Partial<Record<PlayerId, string>>;
  chatMessages: ChatMessage[];
  session: GameSession;
  participantIds?: Partial<Record<PlayerId, string>>;
  matchHistory?: MatchGameRecord[];
  currentGameNumber?: number;
  configuration?: RoomConfiguration;
};

export type RoomConfiguration = {
  teams: boolean;
  startWithPieceOnEntry: boolean;
};

export type MatchPlayerResult = PlayerGameStatistics & {
  participantId: string;
  playerName: string;
  seatId: PlayerId;
};

export type MatchGameRecord = {
  gameNumber: number;
  winnerParticipantIds: string[];
  players: MatchPlayerResult[];
  completedAt: number;
};

export type StoredRoom = {
  room: OnlineRoom;
  version: number;
};

export type RoomView = {
  id: string;
  status: RoomStatus;
  connectedPlayers: PlayerId[];
  playerNames: Partial<Record<PlayerId, string>>;
  chatMessages: ChatMessage[];
  requiredPlayers: number;
  session: GameSessionView;
  viewerPlayerId: PlayerId | null;
  matchHistory: MatchGameRecord[];
  currentGameNumber: number;
};

export type RoomAccess = {
  roomId: string;
  playerId: PlayerId;
  playerToken: string;
};

export type RoomJoinResult = {
  access: RoomAccess;
  room: RoomView;
};

export type CreateRoomOptions = {
  playerCount?: BoardPlayerCount;
  teams?: boolean;
  dealer?: PlayerId | "random";
  playerName?: string;
  randomizeSeats?: boolean;
  startWithPieceOnEntry?: boolean;
};

export type StartNextGameOptions = {
  dealer?: PlayerId | "random";
  randomizeSeats?: boolean;
};

export const DEFAULT_PLAYER_NAMES: Record<PlayerId, string> = {
  P1: "Poppy",
  P2: "River",
  P3: "Sunny",
  P4: "Fern",
};

export interface RoomStore {
  get(roomId: string): Promise<StoredRoom | undefined>;
  create(room: OnlineRoom): Promise<boolean>;
  save(room: OnlineRoom, expectedVersion: number): Promise<boolean>;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, StoredRoom>();

  async get(roomId: string): Promise<StoredRoom | undefined> {
    return this.rooms.get(roomId);
  }

  async create(room: OnlineRoom): Promise<boolean> {
    if (this.rooms.has(room.id)) return false;
    this.rooms.set(room.id, { room, version: 0 });
    return true;
  }

  async save(room: OnlineRoom, expectedVersion: number): Promise<boolean> {
    const stored = this.rooms.get(room.id);
    if (!stored || stored.version !== expectedVersion) return false;
    this.rooms.set(room.id, { room, version: expectedVersion + 1 });
    return true;
  }
}

export type RoomServiceOptions = {
  createRoomId?: () => string;
  createPlayerToken?: () => string;
  createRandomState?: () => number;
};

export type RoomErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_NOT_READY"
  | "INVALID_TOKEN"
  | "SEAT_MISMATCH"
  | "ROOM_CONFLICT";

export class RoomError extends Error {
  constructor(readonly code: RoomErrorCode, message: string) {
    super(message);
    this.name = "RoomError";
  }
}

export class RoomService {
  private readonly createRoomId: () => string;
  private readonly createPlayerToken: () => string;
  private readonly randomState: () => number;

  constructor(
    private readonly store: RoomStore,
    options: RoomServiceOptions = {},
  ) {
    this.createRoomId = options.createRoomId ?? defaultRoomId;
    this.createPlayerToken = options.createPlayerToken ?? (() => crypto.randomUUID());
    this.randomState = options.createRandomState ?? createRandomState;
  }

  async createRoom(options: CreateRoomOptions = {}): Promise<RoomJoinResult> {
    const playerToken = this.createPlayerToken();
    const playerTokenHash = await hashPlayerToken(playerToken);
    const playerCount = options.playerCount ?? 4;
    const teams = options.teams ?? playerCount === 4;
    const game = createGame({
      randomState: this.randomState(),
      playerCount,
      teams,
      startWithPieceOnEntry: options.startWithPieceOnEntry ?? true,
      ...(options.dealer && options.dealer !== "random" ? { dealer: options.dealer } : {}),
    });
    const joinOrder = options.randomizeSeats
      ? shufflePlayerIds(game.players.map((player) => player.id), this.randomState())
      : game.players.map((player) => player.id);
    const playerId = joinOrder[0];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const roomId = this.createRoomId().trim();
      if (!/^\d{4}$/.test(roomId)) continue;
      const room: OnlineRoom = {
        id: roomId,
        seats: { [playerId]: playerTokenHash },
        joinOrder,
        playerNames: { [playerId]: normalizePlayerName(options.playerName, playerId) },
        chatMessages: [],
        session: createGameSession(roomId, game),
        participantIds: Object.fromEntries(
          game.players.map((player) => [player.id, `player-${player.id}`]),
        ),
        matchHistory: [],
        currentGameNumber: 1,
        configuration: {
          teams,
          startWithPieceOnEntry: options.startWithPieceOnEntry ?? true,
        },
      };
      if (await this.store.create(room)) {
        return {
          access: { roomId, playerId, playerToken },
          room: this.view(room, playerId),
        };
      }
    }
    throw new Error("Unable to allocate a unique room ID.");
  }

  async joinRoom(roomId: string, playerName?: string): Promise<RoomJoinResult> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const stored = await this.getRoom(roomId);
      const playerId = (stored.room.joinOrder ?? stored.room.session.game.players.map((player) => player.id))
        .find((candidate) => !stored.room.seats[candidate]);
      if (!playerId) throw new RoomError("ROOM_FULL", `Room ${stored.room.id} is full.`);

      const playerToken = this.createPlayerToken();
      const playerTokenHash = await hashPlayerToken(playerToken);
      const next = {
        ...stored.room,
        seats: { ...stored.room.seats, [playerId]: playerTokenHash },
        playerNames: {
          ...stored.room.playerNames,
          [playerId]: normalizePlayerName(playerName, playerId),
        },
        participantIds: {
          ...stored.room.participantIds,
          [playerId]: stored.room.participantIds?.[playerId] ?? `player-${playerId}`,
        },
      };
      if (await this.store.save(next, stored.version)) {
        return {
          access: { roomId: next.id, playerId, playerToken },
          room: this.view(next, playerId),
        };
      }
    }
    throw new RoomError("ROOM_CONFLICT", "Another player joined at the same time. Please try again.");
  }

  async getRoomView(roomId: string, playerToken?: string): Promise<RoomView> {
    const { room } = await this.getRoom(roomId);
    const viewer = playerToken ? await this.playerForToken(room, playerToken) : null;
    return this.view(room, viewer);
  }

  async submitCommand(
    roomId: string,
    playerToken: string,
    envelope: CommandEnvelope,
  ): Promise<RoomView> {
    const stored = await this.getRoom(roomId);
    const room = stored.room;
    if (this.status(room) === "waiting") {
      throw new RoomError("ROOM_NOT_READY", "Every seat must be filled before play begins.");
    }

    const playerId = await this.playerForToken(room, playerToken);
    if (envelope.command.actor !== playerId) {
      throw new RoomError("SEAT_MISMATCH", "The command actor does not match this player token.");
    }

    const nextSession = applySessionCommand(room.session, envelope);
    const next = nextSession.game.winningTeam && !room.session.game.winningTeam
      ? recordCompletedGame({ ...room, session: nextSession })
      : { ...room, session: nextSession };
    if (!await this.store.save(next, stored.version)) {
      throw new SessionCommandError(
        "REVISION_CONFLICT",
        "The room changed before this move was saved. Refresh and try again.",
      );
    }
    return this.view(next, playerId);
  }

  async startNextGame(
    roomId: string,
    playerToken: string,
    options: StartNextGameOptions = {},
  ): Promise<RoomJoinResult> {
    const stored = await this.getRoom(roomId);
    await this.playerForToken(stored.room, playerToken);
    if (this.status(stored.room) !== "complete") {
      throw new RoomError("ROOM_NOT_READY", "A new game can only begin after the current game is complete.");
    }

    const completedRoom = recordCompletedGame(stored.room);
    const playerIds = completedRoom.session.game.players.map((player) => player.id);
    const ruleset = getRulesetDefinition(completedRoom.session.game.rulesetId);
    const configuration = completedRoom.configuration ?? {
      teams: ruleset.exchange === "partners",
      startWithPieceOnEntry: true,
    };
    const selectedDealerParticipant = options.dealer && options.dealer !== "random"
      ? participantIdForSeat(completedRoom, options.dealer)
      : null;
    const rotated = options.randomizeSeats
      ? rotateRoomSeats(completedRoom, playerIds, this.randomState())
      : completedRoom;
    const dealer = selectedDealerParticipant
      ? playerIds.find((playerId) => participantIdForSeat(rotated, playerId) === selectedDealerParticipant)
      : undefined;
    const game = createGame({
      randomState: this.randomState(),
      playerCount: ruleset.board.playerCount,
      teams: configuration.teams,
      startWithPieceOnEntry: configuration.startWithPieceOnEntry,
      ...(dealer ? { dealer } : {}),
    });
    const next: OnlineRoom = {
      ...rotated,
      chatMessages: [],
      session: createGameSession(rotated.id, game),
      currentGameNumber: (completedRoom.currentGameNumber ?? 1) + 1,
      configuration,
    };
    if (!await this.store.save(next, stored.version)) {
      throw new RoomError("ROOM_CONFLICT", "Another player started the next game first.");
    }
    const nextPlayerId = await this.playerForToken(next, playerToken);
    return {
      access: { roomId: next.id, playerId: nextPlayerId, playerToken },
      room: this.view(next, nextPlayerId),
    };
  }

  async submitChatMessage(
    roomId: string,
    playerToken: string,
    messageId: string,
    text: string,
  ): Promise<RoomView> {
    const normalizedText = normalizeChatText(text);
    if (!messageId.trim() || messageId.length > 64) {
      throw new Error("The chat message ID is invalid.");
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const stored = await this.getRoom(roomId);
      const playerId = await this.playerForToken(stored.room, playerToken);
      if (stored.room.chatMessages.some((message) => message.id === messageId)) {
        return this.view(stored.room, playerId);
      }
      const next: OnlineRoom = {
        ...stored.room,
        chatMessages: [...stored.room.chatMessages, {
          id: messageId,
          playerId,
          text: normalizedText,
          sentAt: Date.now(),
        }].slice(-50),
      };
      if (await this.store.save(next, stored.version)) return this.view(next, playerId);
    }
    throw new RoomError("ROOM_CONFLICT", "The room changed before the chat message was saved. Please try again.");
  }

  private async getRoom(roomId: string): Promise<StoredRoom> {
    const normalizedId = roomId.trim().toUpperCase();
    const stored = await this.store.get(normalizedId);
    if (!stored) throw new RoomError("ROOM_NOT_FOUND", `Room ${normalizedId} does not exist.`);
    return stored;
  }

  private async playerForToken(room: OnlineRoom, token: string): Promise<PlayerId> {
    const tokenHash = await hashPlayerToken(token);
    const playerId = PLAYER_IDS.find((candidate) => room.seats[candidate] === tokenHash);
    if (!playerId) throw new RoomError("INVALID_TOKEN", "The player token is not valid for this room.");
    return playerId;
  }

  private view(room: OnlineRoom, viewer: PlayerId | null): RoomView {
    return {
      id: room.id,
      status: this.status(room),
      connectedPlayers: PLAYER_IDS.filter((playerId) => Boolean(room.seats[playerId])),
      playerNames: { ...room.playerNames },
      chatMessages: room.chatMessages.map((message) => ({ ...message })),
      requiredPlayers: room.session.game.players.length,
      session: createSessionView(room.session, viewer),
      viewerPlayerId: viewer,
      matchHistory: cloneMatchHistory(room.matchHistory ?? []),
      currentGameNumber: room.currentGameNumber ?? 1,
    };
  }

  private status(room: OnlineRoom): RoomStatus {
    if (room.session.game.winningTeam) return "complete";
    return room.session.game.players.every((player) => Boolean(room.seats[player.id])) ? "active" : "waiting";
  }
}

function recordCompletedGame(room: OnlineRoom): OnlineRoom {
  if (!room.session.game.winningTeam) return room;
  const gameNumber = room.currentGameNumber ?? 1;
  const history = room.matchHistory ?? [];
  if (history.some((game) => game.gameNumber === gameNumber)) return room;
  const playerIds = room.session.game.players.map((player) => player.id);
  const statistics = getGameStatistics(createSessionView(room.session, null).events, playerIds);
  const players = statistics.map((player) => ({
    ...player,
    eliminatedPlayers: { ...player.eliminatedPlayers },
    participantId: participantIdForSeat(room, player.playerId),
    playerName: room.playerNames[player.playerId] ?? DEFAULT_PLAYER_NAMES[player.playerId],
    seatId: player.playerId,
  }));
  return {
    ...room,
    matchHistory: [...history, {
      gameNumber,
      winnerParticipantIds: room.session.game.winningTeam.map((playerId) => participantIdForSeat(room, playerId)),
      players,
      completedAt: Date.now(),
    }],
  };
}

function participantIdForSeat(room: OnlineRoom, playerId: PlayerId): string {
  return room.participantIds?.[playerId] ?? `player-${playerId}`;
}

function rotateRoomSeats(
  room: OnlineRoom,
  playerIds: readonly PlayerId[],
  randomState: number,
): OnlineRoom {
  if (playerIds.length < 2) return room;
  const offset = 1 + (Math.abs(randomState) % (playerIds.length - 1));
  const seats: OnlineRoom["seats"] = {};
  const playerNames: OnlineRoom["playerNames"] = {};
  const participantIds: NonNullable<OnlineRoom["participantIds"]> = {};
  playerIds.forEach((oldSeat, index) => {
    const newSeat = playerIds[(index + offset) % playerIds.length];
    if (room.seats[oldSeat]) seats[newSeat] = room.seats[oldSeat];
    if (room.playerNames[oldSeat]) playerNames[newSeat] = room.playerNames[oldSeat];
    participantIds[newSeat] = participantIdForSeat(room, oldSeat);
  });
  return { ...room, seats, playerNames, participantIds, joinOrder: [...playerIds] };
}

function cloneMatchHistory(history: readonly MatchGameRecord[]): MatchGameRecord[] {
  return history.map((game) => ({
    ...game,
    winnerParticipantIds: [...game.winnerParticipantIds],
    players: game.players.map((player) => ({
      ...player,
      eliminatedPlayers: { ...player.eliminatedPlayers },
    })),
  }));
}

export async function hashPlayerToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizePlayerName(name: string | undefined, playerId: PlayerId): string {
  if (name === undefined || !name.trim()) return DEFAULT_PLAYER_NAMES[playerId];
  const normalized = name.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length > 24) throw new Error("Player names must be 24 characters or fewer.");
  if (/\p{Cc}/u.test(normalized)) throw new Error("Player names cannot contain control characters.");
  return normalized;
}

export function normalizeChatText(text: string): string {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Enter a chat message.");
  if (normalized.length > 200) throw new Error("Chat messages must be 200 characters or fewer.");
  if (/\p{Cc}/u.test(normalized)) throw new Error("Chat messages cannot contain control characters.");
  return normalized;
}

function defaultRoomId(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 10_000;
  return value.toString().padStart(4, "0");
}

function shufflePlayerIds(playerIds: readonly PlayerId[], randomState: number): PlayerId[] {
  const shuffled = [...playerIds];
  let state = randomState >>> 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
