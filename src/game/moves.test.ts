import { describe, expect, it } from "vitest";

import { getEntryIndex, getHomeEntranceIndex, getTrackIndex } from "./board";
import { getLegalBackwardMove, getLegalForwardMoves } from "./moves";
import type { Piece, PiecePosition, PlayerId } from "./types";

function piece(id: string, owner: PlayerId, position: PiecePosition): Piece {
  return { id, owner, position };
}

describe("legal forward movement", () => {
  it("does not move reserve pieces", () => {
    const pieces = [piece("P1-1", "P1", { zone: "reserve" })];

    expect(getLegalForwardMoves(pieces, "P1-1", 2)).toEqual([]);
  });

  it("moves clockwise and removes entry protection from the mover", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getEntryIndex("P1"),
        isEntryProtected: true,
      }),
    ];

    expect(getLegalForwardMoves(pieces, "P1-1", 2)).toContainEqual({
      kind: "forward",
      pieceId: "P1-1",
      route: "track",
      destination: {
        zone: "track",
        index: getTrackIndex("P2", 2),
        isEntryProtected: false,
      },
    });
  });

  it("allows passing ordinary pieces and captures the landing occupant", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 0,
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: 1,
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", {
        zone: "track",
        index: 2,
        isEntryProtected: false,
      }),
    ];

    expect(getLegalForwardMoves(pieces, "P1-1", 2)).toContainEqual({
      kind: "forward",
      pieceId: "P1-1",
      route: "track",
      destination: { zone: "track", index: 2, isEntryProtected: false },
      capturedPieceId: "P1-2",
    });
  });

  it("cannot pass or land on a protected entry piece", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getTrackIndex("P2", 16),
        isEntryProtected: false,
      }),
      piece("P2-1", "P2", {
        zone: "track",
        index: getEntryIndex("P2"),
        isEntryProtected: true,
      }),
    ];

    expect(getLegalForwardMoves(pieces, "P1-1", 2)).toEqual([]);
    expect(getLegalForwardMoves(pieces, "P1-1", 3)).toEqual([]);
  });

  it("offers both track and home routes when both are legal", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getHomeEntranceIndex("P1"),
        isEntryProtected: false,
      }),
    ];

    expect(getLegalForwardMoves(pieces, "P1-1", 2)).toEqual([
      {
        kind: "forward",
        pieceId: "P1-1",
        route: "track",
        destination: {
          zone: "track",
          index: getTrackIndex("P1", 18),
          isEntryProtected: false,
        },
      },
      {
        kind: "forward",
        pieceId: "P1-1",
        route: "home",
        destination: { zone: "home", index: 1 },
      },
    ]);
  });

  it("blocks home entry when any required home space is occupied", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: getHomeEntranceIndex("P1"),
        isEntryProtected: false,
      }),
      piece("P1-2", "P1", { zone: "home", index: 1 }),
    ];

    expect(getLegalForwardMoves(pieces, "P1-1", 3)).toEqual([
      {
        kind: "forward",
        pieceId: "P1-1",
        route: "track",
        destination: {
          zone: "track",
          index: getTrackIndex("P2", 1),
          isEntryProtected: false,
        },
      },
    ]);
  });

  it("moves within home only when no piece must be passed", () => {
    const openPieces = [piece("P1-1", "P1", { zone: "home", index: 0 })];
    const blockedPieces = [
      ...openPieces,
      piece("P1-2", "P1", { zone: "home", index: 2 }),
    ];

    expect(getLegalForwardMoves(openPieces, "P1-1", 3)).toEqual([
      {
        kind: "forward",
        pieceId: "P1-1",
        route: "home",
        destination: { zone: "home", index: 3 },
      },
    ]);
    expect(getLegalForwardMoves(blockedPieces, "P1-1", 3)).toEqual([]);
  });

  it("rejects moves beyond home and invalid movement values", () => {
    const pieces = [piece("P1-1", "P1", { zone: "home", index: 3 })];

    expect(getLegalForwardMoves(pieces, "P1-1", 1)).toEqual([]);
    expect(() => getLegalForwardMoves(pieces, "P1-1", 0)).toThrow(RangeError);
    expect(() => getLegalForwardMoves(pieces, "missing", 1)).toThrow(
      "Unknown piece: missing",
    );
  });
});

describe("legal backward movement", () => {
  it("moves backward around the track and removes entry protection", () => {
    const pieces = [
      piece("P1-1", "P1", {
        zone: "track",
        index: 1,
        isEntryProtected: true,
      }),
    ];

    expect(getLegalBackwardMove(pieces, "P1-1", 4)).toEqual([
      {
        kind: "backward",
        pieceId: "P1-1",
        route: "track",
        destination: {
          zone: "track",
          index: 69,
          isEntryProtected: false,
        },
      },
    ]);
  });

  it("captures a landing occupant but cannot cross a protected entry", () => {
    const moving = piece("P1-1", "P1", {
      zone: "track",
      index: 10,
      isEntryProtected: false,
    });
    const ordinary = piece("P2-1", "P2", {
      zone: "track",
      index: 6,
      isEntryProtected: false,
    });
    const protectedPiece = piece("P2-2", "P2", {
      zone: "track",
      index: 8,
      isEntryProtected: true,
    });

    expect(getLegalBackwardMove([moving, ordinary], "P1-1", 4)[0]).toMatchObject(
      { capturedPieceId: "P2-1" },
    );
    expect(
      getLegalBackwardMove([moving, ordinary, protectedPiece], "P1-1", 4),
    ).toEqual([]);
  });

  it("cannot move reserve or home pieces backward", () => {
    expect(
      getLegalBackwardMove(
        [piece("P1-1", "P1", { zone: "reserve" })],
        "P1-1",
        4,
      ),
    ).toEqual([]);
    expect(
      getLegalBackwardMove(
        [piece("P1-1", "P1", { zone: "home", index: 0 })],
        "P1-1",
        4,
      ),
    ).toEqual([]);
  });
});
