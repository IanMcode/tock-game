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

  it("adds default names when loading rooms created before custom names", async () => {
    const room = await createRoom();
    const legacyRoom = { ...room } as Partial<OnlineRoom>;
    delete legacyRoom.playerNames;
    delete legacyRoom.chatMessages;

    const restored = deserializeOnlineRoom({ version: 1, room: legacyRoom });
    expect(restored.playerNames).toEqual({ P1: "Poppy" });
    expect(restored.chatMessages).toEqual([]);
  });
});

async function createRoom(): Promise<OnlineRoom> {
  const id = "TOCK01";
  return {
    id,
    seats: { P1: await hashPlayerToken("private-token") },
    playerNames: { P1: "Ian" },
    chatMessages: [],
    session: createGameSession(id, createGame({ randomState: 12_345 })),
  };
}
