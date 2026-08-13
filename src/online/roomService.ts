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

    const next = { ...room, session: applySessionCommand(room.session, envelope) };
    if (!await this.store.save(next, stored.version)) {
      throw new SessionCommandError(
        "REVISION_CONFLICT",
        "The room changed before this move was saved. Refresh and try again.",
      );
    }
    return this.view(next, playerId);
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
    };
  }

  private status(room: OnlineRoom): RoomStatus {
    if (room.session.game.winningTeam) return "complete";
    return room.session.game.players.every((player) => Boolean(room.seats[player.id])) ? "active" : "waiting";
  }
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
