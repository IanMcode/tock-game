import { describe, expect, it } from "vitest";

import { createGame } from "../game/createGame";
import { createGameSession } from "../game/session";
import { deserializeOnlineRoom, serializeOnlineRoom } from "./roomPersistence";
import { hashPlayerToken, type OnlineRoom } from "./roomService";

describe("online room persistence", () => {
  it("round-trips a validated room record", async () => {
    const room = await createRoom();

    expect(deserializeOnlineRoom(serializeOnlineRoom(room))).toEqual(room);
  });

  it("rejects unsupported and malformed room records", async () => {
    const room = await createRoom();

    expect(() => deserializeOnlineRoom({ version: 99, room })).toThrow(/version/i);
    expect(() => deserializeOnlineRoom({
      version: 1,
      room: { ...room, seats: { P1: "raw-secret" } },
    })).toThrow(/credential/i);
  });
});

async function createRoom(): Promise<OnlineRoom> {
  const id = "TOCK01";
  return {
    id,
    seats: { P1: await hashPlayerToken("private-token") },
    session: createGameSession(id, createGame({ randomState: 12_345 })),
  };
}
