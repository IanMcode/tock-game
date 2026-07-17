import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import {
  getAllPieces,
  getHomeOccupant,
  getPieceById,
  getTrackOccupant,
  isProtectedEntryPiece,
} from "./occupancy";
import type { Piece } from "./types";

const pieces: Piece[] = [
  {
    id: "P1-1",
    owner: "P1",
    position: { zone: "track", index: 17, isEntryProtected: true },
  },
  {
    id: "P1-2",
    owner: "P1",
    position: { zone: "home", index: 0 },
  },
  {
    id: "P2-1",
    owner: "P2",
    position: { zone: "home", index: 0 },
  },
];

describe("board occupancy", () => {
  it("flattens all pieces from a game", () => {
    expect(getAllPieces(createGame({ shuffle: false }))).toHaveLength(16);
  });

  it("finds pieces by id and track position", () => {
    expect(getPieceById(pieces, "P1-1")?.owner).toBe("P1");
    expect(getTrackOccupant(pieces, 17)?.id).toBe("P1-1");
    expect(getTrackOccupant(pieces, 17, "P1-1")).toBeUndefined();
  });

  it("keeps identically numbered home lanes separate by owner", () => {
    expect(getHomeOccupant(pieces, "P1", 0)?.id).toBe("P1-2");
    expect(getHomeOccupant(pieces, "P2", 0)?.id).toBe("P2-1");
  });

  it("recognizes entry protection only on protected track pieces", () => {
    expect(isProtectedEntryPiece(pieces[0])).toBe(true);
    expect(isProtectedEntryPiece(pieces[1])).toBe(false);
    expect(isProtectedEntryPiece(undefined)).toBe(false);
  });
});
