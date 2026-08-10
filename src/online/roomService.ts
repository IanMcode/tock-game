import { createRandomState } from "../game/cards";
import { createGame } from "../game/createGame";
import type { BoardPlayerCount } from "../game/definition";
import {
  applySessionCommand,
  createGameSession,
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
  get(roomId: string): OnlineRoom | undefined;
  save(room: OnlineRoom): void;
}

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, OnlineRoom>();

  get(roomId: string): OnlineRoom | undefined {
    return this.rooms.get(roomId);
  }

  save(room: OnlineRoom): void {
    this.rooms.set(room.id, room);
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
  | "SEAT_MISMATCH";

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

  createRoom(options: CreateRoomOptions = {}): RoomJoinResult {
    const roomId = this.uniqueRoomId();
    const playerId = PLAYER_IDS[0];
    const playerToken = this.createPlayerToken();
    const playerCount = options.playerCount ?? 4;
    const teams = options.teams ?? playerCount === 4;
    const game = createGame({
      randomState: this.randomState(),
      playerCount,
      teams,
      ...(options.dealer && options.dealer !== "random" ? { dealer: options.dealer } : {}),
    });
    const room: OnlineRoom = {
      id: roomId,
      seats: { [playerId]: playerToken },
      session: createGameSession(roomId, game),
    };
    this.store.save(room);
    return {
      access: { roomId, playerId, playerToken },
      room: this.view(room, playerId),
    };
  }

  joinRoom(roomId: string): RoomJoinResult {
    const room = this.getRoom(roomId);
    const playerId = room.session.game.players
      .map((player) => player.id)
      .find((candidate) => !room.seats[candidate]);
    if (!playerId) throw new RoomError("ROOM_FULL", `Room ${room.id} is full.`);

    const playerToken = this.createPlayerToken();
    const next = { ...room, seats: { ...room.seats, [playerId]: playerToken } };
    this.store.save(next);
    return {
      access: { roomId: next.id, playerId, playerToken },
      room: this.view(next, playerId),
    };
  }

  getRoomView(roomId: string, playerToken?: string): RoomView {
    const room = this.getRoom(roomId);
    const viewer = playerToken ? this.playerForToken(room, playerToken) : null;
    return this.view(room, viewer);
  }

  submitCommand(
    roomId: string,
    playerToken: string,
    envelope: CommandEnvelope,
  ): RoomView {
    const room = this.getRoom(roomId);
    if (this.status(room) === "waiting") {
      throw new RoomError("ROOM_NOT_READY", "All four players must join before play begins.");
    }

    const playerId = this.playerForToken(room, playerToken);
    if (envelope.command.actor !== playerId) {
      throw new RoomError("SEAT_MISMATCH", "The command actor does not match this player token.");
    }

    const next = { ...room, session: applySessionCommand(room.session, envelope) };
    this.store.save(next);
    return this.view(next, playerId);
  }

  private getRoom(roomId: string): OnlineRoom {
    const normalizedId = roomId.trim().toUpperCase();
    const room = this.store.get(normalizedId);
    if (!room) throw new RoomError("ROOM_NOT_FOUND", `Room ${normalizedId} does not exist.`);
    return room;
  }

  private playerForToken(room: OnlineRoom, token: string): PlayerId {
    const playerId = PLAYER_IDS.find((candidate) => room.seats[candidate] === token);
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

  private uniqueRoomId(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = this.createRoomId().trim().toUpperCase();
      if (candidate && !this.store.get(candidate)) return candidate;
    }
    throw new Error("Unable to allocate a unique room ID.");
  }
}

function defaultRoomId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
