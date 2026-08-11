import { describe, expect, it } from "vitest";

import { getEntryIndex } from "./board";
import { applyPieceMove, getLegalEntryMoves } from "./actions";
import type { Piece } from "./types";

describe("piece actions", () => {
  it("generates one protected entry choice for each reserve piece", () => {
    const pieces: Piece[] = [
      { id: "P1-1", owner: "P1", position: { zone: "reserve" } },
      { id: "P1-2", owner: "P1", position: { zone: "reserve" } },
      { id: "P2-1", owner: "P2", position: { zone: "reserve" } },
    ];

    expect(getLegalEntryMoves(pieces, "P1")).toEqual([
      {
        kind: "enter",
        pieceId: "P1-1",
        destination: {
          zone: "track",
          index: getEntryIndex("P1"),
          isEntryProtected: true,
        },
      },
      {
        kind: "enter",
        pieceId: "P1-2",
        destination: {
          zone: "track",
          index: getEntryIndex("P1"),
          isEntryProtected: true,
        },
      },
    ]);
  });

  it("allows entry to eliminate any occupant, including a protected piece", () => {
    const pieces: Piece[] = [
      { id: "P1-1", owner: "P1", position: { zone: "reserve" } },
      {
        id: "P2-1",
        owner: "P2",
        position: {
          zone: "track",
          index: getEntryIndex("P1"),
          isEntryProtected: true,
        },
      },
    ];
    const [move] = getLegalEntryMoves(pieces, "P1");

    expect(move.capturedPieceId).toBe("P2-1");
    expect(applyPieceMove(pieces, move)).toEqual([
      {
        id: "P1-1",
        owner: "P1",
        position: {
          zone: "track",
          index: getEntryIndex("P1"),
          isEntryProtected: true,
        },
      },
      { id: "P2-1", owner: "P2", position: { zone: "reserve" } },
    ]);
  });

  it("applies a capture immutably", () => {
    const pieces: Piece[] = [
      {
        id: "P1-1",
        owner: "P1",
        position: { zone: "track", index: 0, isEntryProtected: false },
      },
      {
        id: "P1-2",
        owner: "P1",
        position: { zone: "track", index: 2, isEntryProtected: false },
      },
    ];
    const move = {
      kind: "forward" as const,
      pieceId: "P1-1",
      route: "track" as const,
      destination: {
        zone: "track" as const,
        index: 2,
        isEntryProtected: false,
      },
      capturedPieceId: "P1-2",
    };

    const result = applyPieceMove(pieces, move);

    expect(result[0].position).toEqual(move.destination);
    expect(result[1].position).toEqual({ zone: "reserve" });
    expect(pieces[0].position).toEqual({
      zone: "track",
      index: 0,
      isEntryProtected: false,
    });
  });
});
