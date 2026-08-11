import { describe, expect, it } from "vitest";

import { createStandardDeck } from "./cards";
import { getEntryIndex } from "./board";
import { createGame } from "./createGame";
import { getNextPlayer } from "./rules";

describe("local game engine", () => {
  it("creates a standard 52-card deck without jokers", () => {
    const deck = createStandardDeck();

    expect(deck).toHaveLength(52);
    expect(deck).not.toContainEqual({ rank: "Joker", suit: "clubs" });
  });

  it("creates four players", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });

    expect(game.players.map((player) => player.id)).toEqual([
      "P1",
      "P2",
      "P3",
      "P4",
    ]);
    expect(game.currentPlayer).toBe("P1");
    expect(game.dealer).toBe("P4");
    expect(game.phase).toBe("exchange");
  });

  it("starts each player's first piece protected on its entry", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });

    for (const player of game.players) {
      expect(player.pieces).toHaveLength(4);
      expect(player.pieces[0].position).toEqual({
        zone: "track",
        index: getEntryIndex(player.id),
        isEntryProtected: true,
      });
      expect(player.pieces.slice(1).every((piece) => piece.position.zone === "reserve")).toBe(true);
    }
  });

  it("can create the all-reserve starting variant", () => {
    const game = createGame({
      shuffle: false,
      dealer: "P4",
      startWithPieceOnEntry: false,
    });

    expect(game.players.every((player) =>
      player.pieces.every((piece) => piece.position.zone === "reserve"),
    )).toBe(true);
  });

  it("returns the next player in turn order", () => {
    expect(getNextPlayer("P1")).toBe("P2");
    expect(getNextPlayer("P2")).toBe("P3");
    expect(getNextPlayer("P3")).toBe("P4");
    expect(getNextPlayer("P4")).toBe("P1");
  });
});
