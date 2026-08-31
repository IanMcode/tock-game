import { describe, expect, it } from "vitest";

import { createGame } from "../game/createGame";
import { createGameSession } from "../game/session";
import type { OnlineRoom } from "./roomService";
import { DEFAULT_CARD_RULE_VARIANTS } from "../game/types";
import { hashPlayerToken } from "./roomService";
import { UpstashRoomStore, type UpstashRoomClient } from "./upstashRoomStore";

describe("Upstash room store", () => {
  it("creates, reads, and atomically updates expiring room records", async () => {
    const redis = new FakeUpstashRoomClient();
    const store = new UpstashRoomStore("https://redis.example", "token", redis);
    const room = await createRoom();

    expect(await store.create(room)).toBe(true);
    expect(await store.create(room)).toBe(false);
    expect(await store.get(room.id)).toEqual({ room, version: 0 });

    const updated = { ...room, playerNames: { ...room.playerNames, P1: "Omi" } };
    expect(await store.save(updated, 8)).toBe(false);
    expect(await store.save(updated, 0)).toBe(true);
    expect(await store.get(room.id)).toEqual({ room: updated, version: 1 });
    expect(redis.lastTtlSeconds).toBe(7 * 24 * 60 * 60);
  });

  it("returns undefined for expired or absent rooms", async () => {
    const store = new UpstashRoomStore("https://redis.example", "token", new FakeUpstashRoomClient());
    expect(await store.get("9999")).toBeUndefined();
  });

  it("requires both server credentials", () => {
    expect(() => new UpstashRoomStore("", "token")).toThrow(/both/i);
    expect(() => new UpstashRoomStore("https://redis.example", "")).toThrow(/both/i);
  });
});

class FakeUpstashRoomClient implements UpstashRoomClient {
  private readonly values = new Map<string, string>();
  lastTtlSeconds = 0;

  async get(key: string): Promise<unknown> {
    return this.values.get(key) ?? null;
  }

  async eval(script: string, keys: string[], args: unknown[]): Promise<unknown> {
    const key = keys[0];
    if (script.includes("EXISTS")) {
      if (this.values.has(key)) return 0;
      this.values.set(key, String(args[0]));
      this.lastTtlSeconds = Number(args[1]);
      return 1;
    }

    const current = this.values.get(key);
    if (!current) return 0;
    const record = JSON.parse(current) as { version: number };
    if (record.version !== Number(args[0])) return 0;
    this.values.set(key, String(args[1]));
    this.lastTtlSeconds = Number(args[2]);
    return 1;
  }
}

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
    configuration: { teams: true, startWithPieceOnEntry: true, charityTurns: 0, charityRepeatAtThreshold: false, cardRules: { ...DEFAULT_CARD_RULE_VARIANTS } },
  };
}
