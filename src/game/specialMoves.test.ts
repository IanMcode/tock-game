import { describe, expect, it } from "vitest";

import { applyAtomicMove } from "./actions";
import { getEntryIndex, getHomeEntranceIndex } from "./board";
import {
  applySplitSevenMove,
  getLegalJackMoves,
  getLegalSplitSevenMoves,
} from "./specialMoves";
import type { Piece, PiecePosition, PlayerId } from "./types";

function piece(id: string, owner: PlayerId, position: PiecePosition): Piece {
  return { id, owner, position };
}

describe("Jack swaps", () => {
  it("swaps two track pieces without eliminating either", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 3,
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: 20,
        isEntryProtected: false,
      }),
    ];
    const [move] = getLegalJackMoves(pieces, "P1");

    expect(applyAtomicMove(pieces, move)).toEqual([
      piece("P1-1", "P1", {
        zone: "track",
        index: 20,
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: 3,
        isEntryProtected: false,
      }),
    ]);
  });

  it("cannot target another player's protected entry piece", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 3,
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: getEntryIndex("P2"),
        isEntryProtected: true,
      }),
    ];

    expect(getLegalJackMoves(pieces, "P1")).toEqual([]);
  });

  it("allows an own protected entry piece to participate and removes protection", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getEntryIndex("P1"),
        isEntryProtected: true,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: 20,
        isEntryProtected: false,
      }),
    ];
    const [move] = getLegalJackMoves(pieces, "P1");
    const result = applyAtomicMove(pieces, move);

    expect(result[0].position).toEqual({
      zone: "track",
      index: 20,
      isEntryProtected: false,
    });
    expect(result[1].position).toEqual({
      zone: "track",
      index: getEntryIndex("P1"),
      isEntryProtected: false,
    });
  });

  it("excludes reserve and home pieces and avoids duplicate own-piece pairs", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 3,
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", {
        zone: "track",
        index: 4,
        isEntryProtected: false,
      }),
      piece("P1-3", "P1", { zone: "reserve" }),
      piece("P2-1", "P2", { zone: "home", index: 0 }),
    ];

    expect(getLegalJackMoves(pieces, "P1")).toHaveLength(1);
  });
});

describe("split 7", () => {
  it("uses exactly seven sequential steps on one piece", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 0,
        isEntryProtected: false,
      }),
    ];
    const [move] = getLegalSplitSevenMoves(pieces, "P1");

    expect(move.steps).toHaveLength(7);
    expect(applySplitSevenMove(pieces, move)[0].position).toEqual({
      zone: "track",
      index: 7,
      isEntryProtected: false,
    });
  });

  it("can split movement across pieces and move a piece more than once", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 0,
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", {
        zone: "track",
        index: 20,
        isEntryProtected: false,
      }),
    ];
    const moves = getLegalSplitSevenMoves(pieces, "P1");
    const split = moves.find(
      (move) =>
        move.steps.filter((step) => step.pieceId === "P1-1").length === 3 &&
        move.steps.filter((step) => step.pieceId === "P1-2").length === 4,
    );

    expect(split).toBeDefined();
    expect(applySplitSevenMove(pieces, split!)).toEqual([
      piece("P1-1", "P1", {
        zone: "track",
        index: 3,
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", {
        zone: "track",
        index: 24,
        isEntryProtected: false,
      }),
    ]);
  });

  it("eliminates every unprotected piece crossed during sequential steps", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 0,
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: 2,
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", {
        zone: "track",
        index: 4,
        isEntryProtected: false,
      }),
    ];
    const moves = getLegalSplitSevenMoves(pieces, "P1");
    const singlePieceMove = moves.find((move) =>
      move.steps.every((step) => step.pieceId === "P1-1"),
    );
    const result = applySplitSevenMove(pieces, singlePieceMove!);

    expect(result.find((current) => current.id === "P2-1")?.position).toEqual({
      zone: "reserve",
    });
    expect(result.find((current) => current.id === "P1-2")?.position).toEqual({
      zone: "reserve",
    });
  });

  it("has no legal move when a protected entry prevents all seven steps", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getEntryIndex("P2") - 1,
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: getEntryIndex("P2"),
        isEntryProtected: true,
      }),
    ];

    expect(getLegalSplitSevenMoves(pieces, "P1")).toEqual([]);
  });

  it("can enter and move through home sequentially without passing pieces", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getHomeEntranceIndex("P1"),
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", {
        zone: "track",
        index: 30,
        isEntryProtected: false,
      }),
    ];
    const moves = getLegalSplitSevenMoves(pieces, "P1");

    expect(
      moves.some((move) =>
        move.steps.some(
          (step) =>
            step.pieceId === "P1-1" && step.destination.zone === "home",
        ),
      ),
    ).toBe(true);
  });

  it("rejects incomplete split sequences", () => {
    expect(() =>
      applySplitSevenMove([], { kind: "split7", steps: [] }),
    ).toThrow("A split 7 must contain exactly seven steps.");
  });
});
