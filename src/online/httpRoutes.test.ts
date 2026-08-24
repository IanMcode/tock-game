import { describe, expect, it } from "vitest";

import { POST as createRoom } from "../../app/api/rooms/route";
import { GET as getRoom } from "../../app/api/rooms/[roomId]/route";
import { POST as joinRoom } from "../../app/api/rooms/[roomId]/join/route";
import { POST as submitCommand } from "../../app/api/rooms/[roomId]/commands/route";
import type { RoomJoinResult, RoomView } from "./roomService";

describe("online room HTTP routes", () => {
  it("creates, joins, reads, and updates a room through HTTP requests", async () => {
    const createdResponse = await createRoom(emptyCreateRequest());
    const created = await readJson<RoomJoinResult>(createdResponse);
    const roomId = created.access.roomId;

    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("cache-control")).toBe("no-store");
    expect(roomId).toMatch(/^\d{4}$/);

    for (let seat = 2; seat <= 4; seat += 1) {
      const response = await joinRoom(
        new Request(`http://localhost/api/rooms/${roomId}/join`, { method: "POST" }),
        context(roomId),
      );
      expect(response.status).toBe(201);
    }

    const roomResponse = await getRoom(
      new Request(`http://localhost/api/rooms/${roomId}`, {
        headers: { authorization: `Bearer ${created.access.playerToken}` },
      }),
      context(roomId),
    );
    const room = await readJson<RoomView>(roomResponse);
    expect(room.status).toBe("active");
    expect(room.session.viewer).toBe("P1");

    const commandResponse = await submitCommand(
      new Request(`http://localhost/api/rooms/${roomId}/commands`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${created.access.playerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          commandId: "http-exchange-p1",
          expectedRevision: 0,
          command: { type: "select-exchange-card", actor: "P1", cardIndex: 0 },
        }),
      }),
      context(roomId),
    );
    const updated = await readJson<RoomView>(commandResponse);
    expect(commandResponse.status).toBe(200);
    expect(updated.session.revision).toBe(1);
    expect(updated.session.game.exchangeSelections).toEqual({ P1: true });
  });

  it("requires a player token for commands", async () => {
    const created = await readJson<RoomJoinResult>(await createRoom(emptyCreateRequest()));
    const response = await submitCommand(
      new Request(`http://localhost/api/rooms/${created.access.roomId}/commands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      context(created.access.roomId),
    );
    const body = await readJson<{ error: { code: string } }>(response);

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("PLAYER_TOKEN_REQUIRED");
  });

  it("requires a player token when reading a room", async () => {
    const created = await readJson<RoomJoinResult>(await createRoom(emptyCreateRequest()));
    const response = await getRoom(
      new Request(`http://localhost/api/rooms/${created.access.roomId}`),
      context(created.access.roomId),
    );
    const body = await readJson<{ error: { code: string } }>(response);

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("PLAYER_TOKEN_REQUIRED");
  });

  it("creates a configured smaller room", async () => {
    const response = await createRoom(new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerCount: 2, teams: false, dealer: "P2" }),
    }));
    const created = await readJson<RoomJoinResult>(response);

    expect(response.status).toBe(201);
    expect(created.room.requiredPlayers).toBe(2);
    expect(created.room.session.game.rulesetId).toBe("free-for-all-2");
    expect(created.room.session.game.dealer).toBe("P2");
  });

  it("accepts player names when creating and joining", async () => {
    const created = await readJson<RoomJoinResult>(await createRoom(new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerCount: 2, teams: false, playerName: "Ian" }),
    })));
    const joined = await readJson<RoomJoinResult>(await joinRoom(
      new Request(`http://localhost/api/rooms/${created.access.roomId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerName: "Omi" }),
      }),
      context(created.access.roomId),
    ));

    expect(joined.room.playerNames).toEqual({ P1: "Ian", P2: "Omi" });
  });
});

function context(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

function emptyCreateRequest() {
  return new Request("http://localhost/api/rooms", { method: "POST" });
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}
