import { describe, expect, it } from "vitest";

import { hashPlayerToken, RoomError, InMemoryRoomStore, RoomService } from "./roomService";

describe("online room service", () => {
  it("creates a private seat and fills a four-player room", async () => {
    const service = createTestService();
    const host = await service.createRoom();

    expect(host.access).toEqual({ roomId: "TOCK01", playerId: "P1", playerToken: "token-1" });
    expect(host.room.status).toBe("waiting");
    expect(host.room.connectedPlayers).toEqual(["P1"]);

    const second = await service.joinRoom("tock01");
    await service.joinRoom("TOCK01");
    const fourth = await service.joinRoom("TOCK01");

    expect(second.access.playerId).toBe("P2");
    expect(fourth.access.playerId).toBe("P4");
    expect(fourth.room.status).toBe("active");
    await expect(service.joinRoom("TOCK01")).rejects.toThrowError(RoomError);
  });

  it("blocks commands until every seat is filled", async () => {
    const service = createTestService();
    const host = await service.createRoom();

    await expectRoomError(() => service.submitCommand("TOCK01", host.access.playerToken, {
      commandId: "exchange-p1",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    }), "ROOM_NOT_READY");
  });

  it("binds commands to the seat token and returns that player's safe view", async () => {
    const service = createTestService();
    const host = await service.createRoom();
    const second = await service.joinRoom("TOCK01");
    await service.joinRoom("TOCK01");
    await service.joinRoom("TOCK01");

    await expectRoomError(() => service.submitCommand("TOCK01", second.access.playerToken, {
      commandId: "spoofed",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    }), "SEAT_MISMATCH");

    const room = await service.submitCommand("TOCK01", host.access.playerToken, {
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
    const reconnected = await service.getRoomView("TOCK01", host.access.playerToken);
    const spectator = await service.getRoomView("TOCK01");

    expect(reconnected.session.viewer).toBe("P1");
    expect(reconnected.session.game.players[0].hand).toHaveLength(5);
    expect(spectator.session.viewer).toBeNull();
    expect(spectator.session.game.players.every((player) => player.hand === undefined)).toBe(true);
    await expectRoomError(() => service.getRoomView("TOCK01", "bad-token"), "INVALID_TOKEN");
  });

  it.each([2, 3] as const)("activates a configured %i-player free-for-all", async (playerCount) => {
    const service = createTestService();
    const host = await service.createRoom({ playerCount, teams: false, dealer: "P1" });
    let latest = host.room;

    for (let seat = 2; seat <= playerCount; seat += 1) {
      latest = (await service.joinRoom("TOCK01")).room;
    }

    expect(latest.requiredPlayers).toBe(playerCount);
    expect(latest.connectedPlayers).toHaveLength(playerCount);
    expect(latest.status).toBe("active");
    expect(latest.session.game.rulesetId).toBe(`free-for-all-${playerCount}`);
    expect(latest.session.game.dealer).toBe("P1");
    expect(latest.session.game.phase).toBe("play");
  });

  it("stores only hashed player credentials", async () => {
    const store = new InMemoryRoomStore();
    const service = new RoomService(store, {
      createRoomId: () => "TOCK01",
      createPlayerToken: () => "private-token",
      createRandomState: () => 12_345,
    });

    const created = await service.createRoom();
    const stored = await store.get(created.access.roomId);

    expect(stored?.room.seats.P1).toBe(await hashPlayerToken("private-token"));
    expect(stored?.room.seats.P1).not.toBe("private-token");
  });

  it("rejects a stale atomic store update", async () => {
    const store = new InMemoryRoomStore();
    const service = new RoomService(store, {
      createRoomId: () => "TOCK01",
      createPlayerToken: () => "private-token",
      createRandomState: () => 12_345,
    });
    await service.createRoom();
    const stored = await store.get("TOCK01");
    expect(stored).toBeDefined();

    expect(await store.save(stored!.room, stored!.version)).toBe(true);
    expect(await store.save(stored!.room, stored!.version)).toBe(false);
  });
});

function createTestService() {
  let token = 0;
  return new RoomService(new InMemoryRoomStore(), {
    createRoomId: () => "TOCK01",
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
