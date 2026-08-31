import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import {
  deserializeGameSnapshot,
  GAME_SNAPSHOT_VERSION,
  serializeGameSnapshot,
} from "./persistence";

describe("game snapshots", () => {
  it("round-trips a validated game state", () => {
    const game = createGame({ randomState: 12_345, dealer: "P4" });

    expect(deserializeGameSnapshot(serializeGameSnapshot(game))).toEqual(game);
  });

  it("rejects unknown snapshot versions", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });
    const serialized = JSON.stringify({ version: GAME_SNAPSHOT_VERSION + 1, game });

    expect(() => deserializeGameSnapshot(serialized)).toThrow("version is not supported");
  });

  it("adds per-hand charity defaults to older snapshots", () => {
    const game = createGame({ shuffle: false, dealer: "P4", charityTurns: 2 });
    const legacyGame = { ...game } as Partial<typeof game>;
    delete legacyGame.charityRepeatAtThreshold;
    delete legacyGame.charityHandEligible;
    delete legacyGame.charityRequestQueue;
    delete legacyGame.charityRequestIndex;

    const restored = deserializeGameSnapshot(JSON.stringify({
      version: GAME_SNAPSHOT_VERSION,
      game: legacyGame,
    }));

    expect(restored.charityRepeatAtThreshold).toBe(false);
    expect(restored.charityHandEligible).toEqual({ P1: true, P2: true, P3: true, P4: true });
    expect(restored.charityRequestQueue).toEqual([]);
    expect(restored.charityRequestIndex).toBe(0);
  });

  it("rejects malformed snapshot content", () => {
    expect(() => deserializeGameSnapshot("not-json")).toThrow("not valid JSON");
    expect(() => deserializeGameSnapshot(JSON.stringify({
      version: GAME_SNAPSHOT_VERSION,
      game: { players: [] },
    }))).toThrow("complete game state");
  });
});
