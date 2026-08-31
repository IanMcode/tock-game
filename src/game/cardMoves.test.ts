import { describe, expect, it } from "vitest";

import { applyAtomicMove } from "./actions";
import { getEntryIndex } from "./board";
import { getLegalBasicCardMoves } from "./cardMoves";
import { applySplitSevenMove } from "./specialMoves";
import { DEFAULT_CARD_RULE_VARIANTS, type Card, type Piece } from "./types";

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

    expect(
      moves.every(
        (move) => move.kind !== "split7" && move.pieceId.startsWith("P1-"),
      ),
    ).toBe(true);
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

    const pieceIds = moves.flatMap((move) =>
      move.kind === "split7" ? [] : [move.pieceId],
    );

    expect(pieceIds).toEqual(["P1-2", "P2-1"]);
    expect(pieceIds).not.toContain("P3-1");
  });

  it("generates complete split-7 sequences", () => {
    const moves = getLegalBasicCardMoves(pieces, "P1", card("7"));

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.kind === "split7")).toBe(true);
  });

  it("generates Jack swaps", () => {
    const moves = getLegalBasicCardMoves(pieces, "P1", card("J"));

    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      kind: "swap",
      pieceId: "P1-2",
      targetPieceId: "P2-1",
    });
  });

  it("can limit an Ace to moving one space", () => {
    const moves = getLegalBasicCardMoves(
      pieces,
      "P1",
      card("A"),
      "classic-partners-4",
      { ...DEFAULT_CARD_RULE_VARIANTS, ace: "one-only" },
    );

    expect(moves.some((move) => move.kind === "enter")).toBe(true);
    expect(
      moves.filter((move) => move.kind === "forward").map((move) => move.destination),
    ).toEqual([{ zone: "track", index: 1, isEntryProtected: false }]);
  });

  it("can let a Jack swap or move eleven spaces", () => {
    const moves = getLegalBasicCardMoves(
      pieces,
      "P1",
      card("J"),
      "classic-partners-4",
      { ...DEFAULT_CARD_RULE_VARIANTS, jack: "swap-or-eleven" },
    );

    expect(moves.some((move) => move.kind === "swap")).toBe(true);
    expect(moves).toContainEqual({
      kind: "forward",
      pieceId: "P1-2",
      route: "track",
      destination: { zone: "track", index: 11, isEntryProtected: false },
    });
  });

  it("can make a King eliminate every piece it passes or lands on", () => {
    const capturePieces: Piece[] = [
      {
        id: "P1-1",
        owner: "P1",
        position: { zone: "track", index: 0, isEntryProtected: false },
      },
      {
        id: "P2-1",
        owner: "P2",
        position: { zone: "track", index: 3, isEntryProtected: false },
      },
      {
        id: "P3-1",
        owner: "P3",
        position: { zone: "track", index: 13, isEntryProtected: false },
      },
    ];
    const move = getLegalBasicCardMoves(
      capturePieces,
      "P1",
      card("K"),
      "classic-partners-4",
      { ...DEFAULT_CARD_RULE_VARIANTS, king: "eliminate-passed" },
    ).find((candidate) => candidate.kind === "forward");

    expect(move).toMatchObject({
      kind: "forward",
      pieceId: "P1-1",
      capturedPieceIds: ["P2-1", "P3-1"],
    });
    expect(move ? applyAtomicMove(capturePieces, move) : []).toEqual([
      {
        id: "P1-1",
        owner: "P1",
        position: { zone: "track", index: 13, isEntryProtected: false },
      },
      { id: "P2-1", owner: "P2", position: { zone: "reserve" } },
      { id: "P3-1", owner: "P3", position: { zone: "reserve" } },
    ]);
  });

  it("can make a split 7 capture only where its pieces finish", () => {
    const capturePieces: Piece[] = [
      {
        id: "P1-1",
        owner: "P1",
        position: { zone: "track", index: 0, isEntryProtected: false },
      },
      {
        id: "P2-1",
        owner: "P2",
        position: { zone: "track", index: 2, isEntryProtected: false },
      },
      {
        id: "P3-1",
        owner: "P3",
        position: { zone: "track", index: 7, isEntryProtected: false },
      },
    ];
    const landingOnlyMove = getLegalBasicCardMoves(
      capturePieces,
      "P1",
      card("7"),
      "classic-partners-4",
      { ...DEFAULT_CARD_RULE_VARIANTS, seven: "land-only" },
    ).find((candidate) => candidate.kind === "split7");
    const eliminatePassedMove = getLegalBasicCardMoves(
      capturePieces,
      "P1",
      card("7"),
      "classic-partners-4",
      { ...DEFAULT_CARD_RULE_VARIANTS, seven: "eliminate-passed" },
    ).find((candidate) => candidate.kind === "split7");

    expect(landingOnlyMove?.kind).toBe("split7");
    expect(eliminatePassedMove?.kind).toBe("split7");
    const landingResult = landingOnlyMove?.kind === "split7"
      ? applySplitSevenMove(capturePieces, landingOnlyMove)
      : [];
    const eliminatePassedResult = eliminatePassedMove?.kind === "split7"
      ? applySplitSevenMove(capturePieces, eliminatePassedMove)
      : [];

    expect(landingResult.find((piece) => piece.id === "P2-1")?.position).toEqual({
      zone: "track",
      index: 2,
      isEntryProtected: false,
    });
    expect(landingResult.find((piece) => piece.id === "P3-1")?.position).toEqual({
      zone: "reserve",
    });
    expect(eliminatePassedResult.find((piece) => piece.id === "P2-1")?.position).toEqual({
      zone: "reserve",
    });
    expect(eliminatePassedResult.find((piece) => piece.id === "P3-1")?.position).toEqual({
      zone: "reserve",
    });
  });
});
