import { describe, expect, it } from "vitest";

import { RoomError, InMemoryRoomStore, RoomService } from "./roomService";

describe("online room service", () => {
  it("creates a private seat and fills a four-player room", () => {
    const service = createTestService();
    const host = service.createRoom();

    expect(host.access).toEqual({ roomId: "TOCK01", playerId: "P1", playerToken: "token-1" });
    expect(host.room.status).toBe("waiting");
    expect(host.room.connectedPlayers).toEqual(["P1"]);

    const second = service.joinRoom("tock01");
    service.joinRoom("TOCK01");
    const fourth = service.joinRoom("TOCK01");

    expect(second.access.playerId).toBe("P2");
    expect(fourth.access.playerId).toBe("P4");
    expect(fourth.room.status).toBe("active");
    expect(() => service.joinRoom("TOCK01")).toThrowError(RoomError);
  });

  it("blocks commands until every seat is filled", () => {
    const service = createTestService();
    const host = service.createRoom();

    expectRoomError(() => service.submitCommand("TOCK01", host.access.playerToken, {
      commandId: "exchange-p1",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    }), "ROOM_NOT_READY");
  });

  it("binds commands to the seat token and returns that player's safe view", () => {
    const service = createTestService();
    const host = service.createRoom();
    const second = service.joinRoom("TOCK01");
    service.joinRoom("TOCK01");
    service.joinRoom("TOCK01");

    expectRoomError(() => service.submitCommand("TOCK01", second.access.playerToken, {
      commandId: "spoofed",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    }), "SEAT_MISMATCH");

    const room = service.submitCommand("TOCK01", host.access.playerToken, {
      commandId: "exchange-p1",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
    });
    expect(room.session.revision).toBe(1);
    expect(room.session.viewer).toBe("P1");
    expect(room.session.game.players.find((player) => player.id === "P2")?.hand).toBeUndefined();
  });

  it("supports token-based reconnection and spectator-safe views", () => {
    const service = createTestService();
    const host = service.createRoom();
    const reconnected = service.getRoomView("TOCK01", host.access.playerToken);
    const spectator = service.getRoomView("TOCK01");

    expect(reconnected.session.viewer).toBe("P1");
    expect(reconnected.session.game.players[0].hand).toHaveLength(5);
    expect(spectator.session.viewer).toBeNull();
    expect(spectator.session.game.players.every((player) => player.hand === undefined)).toBe(true);
    expectRoomError(() => service.getRoomView("TOCK01", "bad-token"), "INVALID_TOKEN");
  });

  it.each([2, 3] as const)("activates a configured %i-player free-for-all", (playerCount) => {
    const service = createTestService();
    const host = service.createRoom({ playerCount, teams: false, dealer: "P1" });
    let latest = host.room;

    for (let seat = 2; seat <= playerCount; seat += 1) {
      latest = service.joinRoom("TOCK01").room;
    }

    expect(latest.requiredPlayers).toBe(playerCount);
    expect(latest.connectedPlayers).toHaveLength(playerCount);
    expect(latest.status).toBe("active");
    expect(latest.session.game.rulesetId).toBe(`free-for-all-${playerCount}`);
    expect(latest.session.game.dealer).toBe("P1");
    expect(latest.session.game.phase).toBe("play");
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

function expectRoomError(run: () => unknown, code: RoomError["code"]) {
  try {
    run();
    throw new Error("Expected the room operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    expect((error as RoomError).code).toBe(code);
  }
}
