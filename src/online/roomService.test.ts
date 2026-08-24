import { describe, expect, it } from "vitest";

import { hashPlayerToken, RoomError, InMemoryRoomStore, RoomService } from "./roomService";

describe("online room service", () => {
  it("creates a private seat and fills a four-player room", async () => {
    const service = createTestService();
    const host = await service.createRoom();

    expect(host.access).toEqual({ roomId: "1234", playerId: "P1", playerToken: "token-1" });
    expect(host.room.status).toBe("waiting");
    expect(host.room.connectedPlayers).toEqual(["P1"]);

    const second = await service.joinRoom("1234");
    await service.joinRoom("1234");
    const fourth = await service.joinRoom("1234");

    expect(second.access.playerId).toBe("P2");
    expect(fourth.access.playerId).toBe("P4");
    expect(fourth.room.status).toBe("active");
    await expect(service.joinRoom("1234")).rejects.toThrowError(RoomError);
  });

  it("blocks commands until every seat is filled", async () => {
    const service = createTestService();
    const host = await service.createRoom();

    await expectRoomError(() => service.submitCommand("1234", host.access.playerToken, {
      commandId: "exchange-p1",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    }), "ROOM_NOT_READY");
  });

  it("binds commands to the seat token and returns that player's safe view", async () => {
    const service = createTestService();
    const host = await service.createRoom();
    const second = await service.joinRoom("1234");
    await service.joinRoom("1234");
    await service.joinRoom("1234");

    await expectRoomError(() => service.submitCommand("1234", second.access.playerToken, {
      commandId: "spoofed",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    }), "SEAT_MISMATCH");

    const room = await service.submitCommand("1234", host.access.playerToken, {
      commandId: "exchange-p1",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    });
    expect(room.session.revision).toBe(1);
    expect(room.session.viewer).toBe("P1");
    expect(room.session.game.players.find((player) => player.id === "P2")?.hand).toBeUndefined();
  });

  it("supports token-based reconnection and spectator-safe views", async () => {
    const service = createTestService();
    const host = await service.createRoom();
    const reconnected = await service.getRoomView("1234", host.access.playerToken);
    const spectator = await service.getRoomView("1234");

    expect(reconnected.session.viewer).toBe("P1");
    expect(reconnected.session.game.players[0].hand).toHaveLength(5);
    expect(spectator.session.viewer).toBeNull();
    expect(spectator.session.game.players.every((player) => player.hand === undefined)).toBe(true);
    await expectRoomError(() => service.getRoomView("1234", "bad-token"), "INVALID_TOKEN");
  });

  it.each([2, 3] as const)("activates a configured %i-player free-for-all", async (playerCount) => {
    const service = createTestService();
    const host = await service.createRoom({ playerCount, teams: false, dealer: "P1" });
    let latest = host.room;

    for (let seat = 2; seat <= playerCount; seat += 1) {
      latest = (await service.joinRoom("1234")).room;
    }

    expect(latest.requiredPlayers).toBe(playerCount);
    expect(latest.connectedPlayers).toHaveLength(playerCount);
    expect(latest.status).toBe("active");
    expect(latest.session.game.rulesetId).toBe(`free-for-all-${playerCount}`);
    expect(latest.session.game.dealer).toBe("P1");
    expect(latest.session.game.phase).toBe("play");
  });

  it("supports creating a room without the protected-entry head start", async () => {
    const service = createTestService();
    const host = await service.createRoom({
      playerCount: 2,
      teams: false,
      startWithPieceOnEntry: false,
    });

    expect(host.room.session.game.players.every((player) =>
      player.pieces.every((piece) => piece.position.zone === "reserve"),
    )).toBe(true);
  });

  it("stores only hashed player credentials", async () => {
    const store = new InMemoryRoomStore();
    const service = new RoomService(store, {
      createRoomId: () => "1234",
      createPlayerToken: () => "private-token",
      createRandomState: () => 12_345,
    });

    const created = await service.createRoom();
    const stored = await store.get(created.access.roomId);

    expect(stored?.room.seats.P1).toBe(await hashPlayerToken("private-token"));
    expect(stored?.room.seats.P1).not.toBe("private-token");
  });

  it("stores custom names for the host and joining players", async () => {
    const service = createTestService();
    const host = await service.createRoom({ playerCount: 2, teams: false, playerName: "Ian" });
    const second = await service.joinRoom(host.access.roomId, "Omi");

    expect(second.room.playerNames).toEqual({ P1: "Ian", P2: "Omi" });
  });

  it("can randomize the order in which players occupy board seats", async () => {
    const store = new InMemoryRoomStore();
    let token = 0;
    const service = new RoomService(store, {
      createRoomId: () => "1234",
      createPlayerToken: () => `token-${++token}`,
      createRandomState: () => 12_345,
    });

    const host = await service.createRoom({ playerCount: 4, teams: true, randomizeSeats: true });
    const stored = await store.get("1234");
    expect(stored?.room.joinOrder).toHaveLength(4);
    expect(new Set(stored?.room.joinOrder)).toEqual(new Set(["P1", "P2", "P3", "P4"]));
    expect(host.access.playerId).toBe(stored?.room.joinOrder?.[0]);

    const joined = [
      (await service.joinRoom("1234")).access.playerId,
      (await service.joinRoom("1234")).access.playerId,
      (await service.joinRoom("1234")).access.playerId,
    ];
    expect([host.access.playerId, ...joined]).toEqual(stored?.room.joinOrder);
  });

  it("shares authenticated chat messages with the room", async () => {
    const service = createTestService();
    const host = await service.createRoom({ playerCount: 2, teams: false, playerName: "Ian" });
    const second = await service.joinRoom(host.access.roomId, "Omi");

    const updated = await service.submitChatMessage("1234", second.access.playerToken, "message-1", "  Good luck!  ");

    expect(updated.chatMessages).toEqual([expect.objectContaining({
      id: "message-1",
      playerId: "P2",
      text: "Good luck!",
    })]);
    expect((await service.getRoomView("1234", host.access.playerToken)).chatMessages).toEqual(updated.chatMessages);
  });

  it("starts the next game in the same room while retaining match history and opposite teams", async () => {
    const store = new InMemoryRoomStore();
    let token = 0;
    const service = new RoomService(store, {
      createRoomId: () => "1234",
      createPlayerToken: () => `token-${++token}`,
      createRandomState: () => 12_345,
    });
    const host = await service.createRoom({ playerCount: 4, teams: true, playerName: "Ian" });
    await service.joinRoom("1234", "Omi");
    await service.joinRoom("1234", "Sunny");
    await service.joinRoom("1234", "Fern");
    const stored = await store.get("1234");
    expect(stored).toBeDefined();
    const completed = {
      ...stored!.room,
      chatMessages: [{ id: "old-chat", playerId: "P1" as const, text: "Good game", sentAt: 1 }],
      session: {
        ...stored!.room.session,
        game: { ...stored!.room.session.game, winningTeam: ["P1", "P3"] as ["P1", "P3"] },
      },
    };
    expect(await store.save(completed, stored!.version)).toBe(true);

    const next = await service.startNextGame("1234", host.access.playerToken, {
      dealer: "P2",
      randomizeSeats: true,
    });

    expect(next.access.roomId).toBe("1234");
    expect(next.access.playerId).toBe("P2");
    expect(next.room.currentGameNumber).toBe(2);
    expect(next.room.status).toBe("active");
    expect(next.room.chatMessages).toEqual([]);
    expect(next.room.session.revision).toBe(0);
    expect(next.room.session.game.dealer).toBe("P3");
    expect(next.room.matchHistory).toHaveLength(1);
    expect(next.room.matchHistory[0]).toEqual(expect.objectContaining({
      gameNumber: 1,
      winnerParticipantIds: ["player-P1", "player-P3"],
    }));
    expect(next.room.playerNames.P2).toBe("Ian");
    expect(next.room.playerNames.P4).toBe("Sunny");
  });

  it("rejects a stale atomic store update", async () => {
    const store = new InMemoryRoomStore();
    const service = new RoomService(store, {
      createRoomId: () => "1234",
      createPlayerToken: () => "private-token",
      createRandomState: () => 12_345,
    });
    await service.createRoom();
    const stored = await store.get("1234");
    expect(stored).toBeDefined();

    expect(await store.save(stored!.room, stored!.version)).toBe(true);
    expect(await store.save(stored!.room, stored!.version)).toBe(false);
  });
});

function createTestService() {
  let token = 0;
  return new RoomService(new InMemoryRoomStore(), {
    createRoomId: () => "1234",
    createPlayerToken: () => `token-${++token}`,
    createRandomState: () => 12_345,
  });
}

async function expectRoomError(run: () => Promise<unknown>, code: RoomError["code"]) {
  try {
    await run();
    throw new Error("Expected the room operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    expect((error as RoomError).code).toBe(code);
  }
}
