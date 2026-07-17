import { describe, expect, it } from "vitest";

import { getEntryIndex } from "./board";
import { getLegalBasicCardMoves } from "./cardMoves";
import type { Card, Piece } from "./types";

function card(rank: Card["rank"]): Card {
  return { rank, suit: "clubs" };
}

describe("basic card move generation", () => {
  const pieces: Piece[] = [
    { id: "P1-1", owner: "P1", position: { zone: "reserve" } },
    {
      id: "P1-2",
      owner: "P1",
      position: { zone: "track", index: 0, isEntryProtected: false },
    },
    {
      id: "P2-1",
      owner: "P2",
      position: { zone: "track", index: 20, isEntryProtected: false },
    },
  ];

  it("gives an Ace entry, forward-1, and forward-11 choices", () => {
    const moves = getLegalBasicCardMoves(pieces, "P1", card("A"));

    expect(moves).toHaveLength(3);
    expect(moves).toContainEqual({
      kind: "enter",
      pieceId: "P1-1",
      destination: {
        zone: "track",
        index: getEntryIndex("P1"),
        isEntryProtected: true,
      },
    });
    expect(
      moves.filter((move) => move.kind === "forward").map((move) => move.destination),
    ).toEqual([
      { zone: "track", index: 1, isEntryProtected: false },
      { zone: "track", index: 11, isEntryProtected: false },
    ]);
  });

  it("gives a King entry and forward-13 choices", () => {
    const moves = getLegalBasicCardMoves(pieces, "P1", card("K"));

    expect(moves).toHaveLength(2);
    expect(moves.some((move) => move.kind === "enter")).toBe(true);
    expect(moves).toContainEqual({
      kind: "forward",
      pieceId: "P1-2",
      route: "track",
      destination: { zone: "track", index: 13, isEntryProtected: false },
    });
  });

  it.each([
    ["2", 2],
    ["3", 3],
    ["6", 6],
    ["8", 8],
    ["9", 9],
    ["10", 10],
    ["Q", 12],
  ] as const)("moves %s forward %i spaces", (rank, destinationIndex) => {
    expect(getLegalBasicCardMoves(pieces, "P1", card(rank))).toContainEqual({
      kind: "forward",
      pieceId: "P1-2",
      route: "track",
      destination: {
        zone: "track",
        index: destinationIndex,
        isEntryProtected: false,
      },
    });
  });

  it("does not generate moves for another player's pieces", () => {
    const moves = getLegalBasicCardMoves(pieces, "P1", card("2"));

    expect(moves.every((move) => move.pieceId.startsWith("P1-"))).toBe(true);
  });

  it("moves only the current player's pieces backward with a 4", () => {
    const moves = getLegalBasicCardMoves(pieces, "P1", card("4"));

    expect(moves).toEqual([
      {
        kind: "backward",
        pieceId: "P1-2",
        route: "track",
        destination: { zone: "track", index: 68, isEntryProtected: false },
      },
    ]);
  });

  it("allows a 5 to move any main-track piece but not a home piece", () => {
    const piecesWithHome: Piece[] = [
      ...pieces,
      { id: "P3-1", owner: "P3", position: { zone: "home", index: 0 } },
    ];
    const moves = getLegalBasicCardMoves(piecesWithHome, "P1", card("5"));

    expect(moves.map((move) => move.pieceId)).toEqual(["P1-2", "P2-1"]);
    expect(moves.some((move) => move.pieceId === "P3-1")).toBe(false);
  });

  it.each(["7", "J"] as const)(
    "requires a specialized generator for %s",
    (rank) => {
      expect(() => getLegalBasicCardMoves(pieces, "P1", card(rank))).toThrow(
        `Card ${rank} requires special move generation.`,
      );
    },
  );
});
