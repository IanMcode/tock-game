import { describe, expect, it } from "vitest";

import type { PublicGameEvent } from "../game/view";
import { describePublicGameEvent } from "./history";

describe("online play history", () => {
  it("names an eliminated piece and its return to reserve", () => {
    const event: PublicGameEvent = {
      revision: 4,
      actor: "P1",
      type: "play",
      card: { rank: "5", suit: "hearts" },
      move: {
        kind: "forward",
        pieceId: "P1-2",
        route: "track",
        destination: { zone: "track", index: 8, isEntryProtected: false },
        capturedPieceId: "P2-3",
      },
    };

    expect(describePublicGameEvent(event, { P1: "Ian", P2: "Jon" })).toBe(
      "Ian played 5♥ and moved forward, eliminating Jon's piece 3 and returning it to reserve.",
    );
  });

  it("records every elimination made during a split seven", () => {
    const step = (pieceId: string, index: number, capturedPieceId?: string) => ({
      kind: "forward" as const,
      pieceId,
      route: "track" as const,
      destination: { zone: "track" as const, index, isEntryProtected: false },
      ...(capturedPieceId ? { capturedPieceId } : {}),
    });
    const event: PublicGameEvent = {
      revision: 9,
      actor: "P1",
      type: "play",
      card: { rank: "7", suit: "clubs" },
      move: {
        kind: "split7",
        steps: [
          step("P1-1", 1, "P2-1"),
          step("P1-1", 2),
          step("P1-1", 3),
          step("P1-2", 7, "P3-4"),
          step("P1-2", 8),
          step("P1-2", 9),
          step("P1-2", 10),
        ],
      },
    };

    expect(describePublicGameEvent(event, { P1: "Ian", P2: "Jon", P3: "Omi" })).toContain(
      "eliminating Jon's piece 1 and Omi's piece 4 and returning them to reserve",
    );
  });
});
