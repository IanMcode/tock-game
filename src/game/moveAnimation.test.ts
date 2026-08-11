import { describe, expect, it } from "vitest";

import type { AtomicMove } from "./actions";
import { getMoveAnimationFrames } from "./moveAnimation";
import type { Piece } from "./types";

const trackPiece: Piece = {
  id: "P1-1",
  owner: "P1",
  position: { zone: "track", index: 5, isEntryProtected: false },
};

describe("move animation frames", () => {
  it("creates one frame for every forward track space", () => {
    const move: AtomicMove = {
      kind: "forward",
      pieceId: trackPiece.id,
      route: "track",
      destination: { zone: "track", index: 9, isEntryProtected: false },
    };

    expect(getMoveAnimationFrames([trackPiece], move).map((frame) => frame[0].position.index))
      .toEqual([6, 7, 8, 9]);
  });

  it("creates backward frames in reverse track order", () => {
    const move: AtomicMove = {
      kind: "backward",
      pieceId: trackPiece.id,
      route: "track",
      destination: { zone: "track", index: 1, isEntryProtected: false },
    };

    expect(getMoveAnimationFrames([trackPiece], move).map((frame) => frame[0].position.index))
      .toEqual([4, 3, 2, 1]);
  });

  it("continues from the track into each home space", () => {
    const piece: Piece = {
      ...trackPiece,
      position: { zone: "track", index: 14, isEntryProtected: false },
    };
    const move: AtomicMove = {
      kind: "forward",
      pieceId: piece.id,
      route: "home",
      destination: { zone: "home", index: 1 },
    };

    expect(getMoveAnimationFrames([piece], move).map((frame) => frame[0].position))
      .toEqual([
        { zone: "track", index: 15, isEntryProtected: false },
        { zone: "home", index: 0 },
        { zone: "home", index: 1 },
      ]);
  });

  it("moves both pieces in a Jack swap frame", () => {
    const target: Piece = {
      id: "P2-1",
      owner: "P2",
      position: { zone: "track", index: 20, isEntryProtected: false },
    };
    const move: AtomicMove = {
      kind: "swap",
      pieceId: trackPiece.id,
      targetPieceId: target.id,
      destination: target.position as Extract<Piece["position"], { zone: "track" }>,
      targetDestination: trackPiece.position as Extract<Piece["position"], { zone: "track" }>,
    };

    expect(getMoveAnimationFrames([trackPiece, target], move)[0]).toEqual([
      { pieceId: "P1-1", position: target.position },
      { pieceId: "P2-1", position: trackPiece.position },
    ]);
  });
});
