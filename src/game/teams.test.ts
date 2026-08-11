import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import { getAllPieces } from "./occupancy";
import {
  areAllPiecesHome,
  getControlledPlayer,
  getPartner,
  getWinningTeam,
} from "./teams";
import type { Piece, PlayerId } from "./types";

function homePieces(owner: PlayerId): Piece[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `${owner}-${index + 1}`,
    owner,
    position: { zone: "home" as const, index },
  }));
}

describe("partner teams", () => {
  it("pairs opposite players", () => {
    expect(getPartner("P1")).toBe("P3");
    expect(getPartner("P2")).toBe("P4");
    expect(getPartner("P3")).toBe("P1");
    expect(getPartner("P4")).toBe("P2");
  });

  it("hands control to the partner only after all four pieces are home", () => {
    const initialPieces = getAllPieces(createGame({ shuffle: false }));
    const completedPieces = [
      ...initialPieces.filter((piece) => piece.owner !== "P1"),
      ...homePieces("P1"),
    ];

    expect(areAllPiecesHome(initialPieces, "P1")).toBe(false);
    expect(getControlledPlayer(initialPieces, "P1")).toBe("P1");
    expect(getControlledPlayer(completedPieces, "P1")).toBe("P3");
  });

  it("wins only after both partners have all four pieces home", () => {
    expect(getWinningTeam(homePieces("P1"))).toBeNull();
    expect(getWinningTeam([...homePieces("P1"), ...homePieces("P3")])).toEqual([
      "P1",
      "P3",
    ]);
  });
});
