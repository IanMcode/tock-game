import { describe, expect, it } from "vitest";

import { createStandardDeck } from "./cards";
import { createGame } from "./createGame";
import { getCardMoveValue, getNextPlayer } from "./rules";
import type { Card } from "./types";

function card(rank: Card["rank"]): Card {
  return {
    rank,
    suit: "clubs",
  };
}

describe("local game engine", () => {
  it("creates a standard 52-card deck without jokers", () => {
    const deck = createStandardDeck();

    expect(deck).toHaveLength(52);
    expect(deck).not.toContainEqual({ rank: "Joker", suit: "clubs" });
  });

  it("creates four players", () => {
    const game = createGame({ shuffle: false });

    expect(game.players.map((player) => player.id)).toEqual([
      "P1",
      "P2",
      "P3",
      "P4",
    ]);
    expect(game.currentPlayer).toBe("P1");
  });

  it("creates four pieces per player at start", () => {
    const game = createGame({ shuffle: false });

    for (const player of game.players) {
      expect(player.pieces).toHaveLength(4);
      expect(player.pieces.every((piece) => piece.position === "start")).toBe(
        true,
      );
    }
  });

  it("returns the next player in turn order", () => {
    expect(getNextPlayer("P1")).toBe("P2");
    expect(getNextPlayer("P2")).toBe("P3");
    expect(getNextPlayer("P3")).toBe("P4");
    expect(getNextPlayer("P4")).toBe("P1");
  });

  it("returns card move values", () => {
    expect(getCardMoveValue(card("A"))).toBe("start");
    expect(getCardMoveValue(card("K"))).toBe("start");
    expect(getCardMoveValue(card("J"))).toBe("swap");
    expect(getCardMoveValue(card("7"))).toBe("split7");
    expect(getCardMoveValue(card("Q"))).toBe(12);
    expect(getCardMoveValue(card("2"))).toBe(2);
    expect(getCardMoveValue(card("10"))).toBe(10);
  });
});
