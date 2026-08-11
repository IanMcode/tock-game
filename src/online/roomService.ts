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

export type OnlineRoom = {
  id: string;
  seats: Partial<Record<PlayerId, string>>;
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
    const playerId = PLAYER_IDS[0];
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
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const roomId = this.createRoomId().trim().toUpperCase();
      if (!roomId) continue;
      const room: OnlineRoom = {
        id: roomId,
        seats: { [playerId]: playerTokenHash },
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

  async joinRoom(roomId: string): Promise<RoomJoinResult> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const stored = await this.getRoom(roomId);
      const playerId = stored.room.session.game.players
        .map((player) => player.id)
        .find((candidate) => !stored.room.seats[candidate]);
      if (!playerId) throw new RoomError("ROOM_FULL", `Room ${stored.room.id} is full.`);

      const playerToken = this.createPlayerToken();
      const playerTokenHash = await hashPlayerToken(playerToken);
      const next = {
        ...stored.room,
        seats: { ...stored.room.seats, [playerId]: playerTokenHash },
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

function defaultRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
