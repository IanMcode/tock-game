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
    delete legacyRoom.started;
    delete legacyRoom.hostParticipantId;

    const restored = deserializeOnlineRoom({ version: 1, room: legacyRoom });
    expect(restored.playerNames).toEqual({ P1: "Poppy" });
    expect(restored.chatMessages).toEqual([]);
    expect(restored.started).toBe(false);
    expect(restored.hostParticipantId).toBe("player-P1");
  });
});

async function createRoom(): Promise<OnlineRoom> {
  const id = "1234";
  return {
    id,
    started: false,
    hostParticipantId: "player-P1",
    seats: { P1: await hashPlayerToken("private-token") },
    playerNames: { P1: "Ian" },
    chatMessages: [],
    session: createGameSession(id, createGame({ randomState: 12_345 })),
    participantIds: { P1: "player-P1", P2: "player-P2", P3: "player-P3", P4: "player-P4" },
    matchHistory: [],
    currentGameNumber: 1,
    configuration: { teams: true, startWithPieceOnEntry: true },
  };
}
