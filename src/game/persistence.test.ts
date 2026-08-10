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

  it("rejects malformed snapshot content", () => {
    expect(() => deserializeGameSnapshot("not-json")).toThrow("not valid JSON");
    expect(() => deserializeGameSnapshot(JSON.stringify({
      version: GAME_SNAPSHOT_VERSION,
      game: { players: [] },
    }))).toThrow("complete game state");
  });
});
