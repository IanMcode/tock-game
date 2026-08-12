import { describe, expect, it } from "vitest";

import type { PublicGameEvent } from "../game/view";
import { getGameStatistics } from "./statistics";

describe("online game statistics", () => {
  it("counts played cards and eliminations without counting discards", () => {
    const events: PublicGameEvent[] = [
      { revision: 1, actor: "P1", type: "discard", card: { rank: "J", suit: "clubs" } },
      {
        revision: 2,
        actor: "P1",
        type: "play",
        card: { rank: "J", suit: "spades" },
        move: { kind: "swap", pieceId: "P1-1", targetPieceId: "P2-1", destination: { zone: "track", index: 2, isEntryProtected: false }, targetDestination: { zone: "track", index: 1, isEntryProtected: false } },
      },
      {
        revision: 3,
        actor: "P1",
        type: "play",
        card: { rank: "K", suit: "hearts" },
        move: { kind: "forward", pieceId: "P1-1", route: "track", destination: { zone: "track", index: 15, isEntryProtected: false }, capturedPieceId: "P2-2" },
      },
      {
        revision: 4,
        actor: "P2",
        type: "play",
        card: { rank: "7", suit: "diamonds" },
        move: { kind: "split7", steps: [
          { kind: "forward", pieceId: "P2-1", route: "track", destination: { zone: "track", index: 8, isEntryProtected: false }, capturedPieceId: "P1-2" },
          { kind: "forward", pieceId: "P2-2", route: "track", destination: { zone: "track", index: 12, isEntryProtected: false }, capturedPieceId: "P1-3" },
        ] },
      },
    ];

    expect(getGameStatistics(events, ["P1", "P2"])).toEqual([
      { playerId: "P1", jacksPlayed: 1, outCardsPlayed: 1, eliminations: 1, eliminatedPlayers: { P2: 1 } },
      { playerId: "P2", jacksPlayed: 0, outCardsPlayed: 0, eliminations: 2, eliminatedPlayers: { P1: 2 } },
    ]);
  });
});
