import { describe, expect, it } from "vitest";

import type { PublicGameEvent } from "../game/view";
import {
  getLatestAnimationTurn,
  getCurrentDealerRoundEvents,
  getReplayStartingPieces,
  getUnseenAnimationMoves,
  getUnseenAnimationTurns,
} from "./animation";
import type { Piece } from "../game/types";

const forward = (pieceId: string, index: number) => ({
  kind: "forward" as const,
  pieceId,
  route: "track" as const,
  destination: { zone: "track" as const, index, isEntryProtected: false },
});

describe("online animation event replay", () => {
  it("replays only unseen public moves in revision order", () => {
    const events: PublicGameEvent[] = [
      { revision: 1, actor: "P1", type: "discard", card: { rank: "2", suit: "clubs" } },
      { revision: 2, actor: "P2", type: "play", card: { rank: "3", suit: "clubs" }, move: forward("P2-1", 4) },
      { revision: 3, actor: "P1", type: "discard", card: { rank: "9", suit: "hearts" } },
    ];

    expect(getUnseenAnimationMoves(events, 1, 3)).toEqual([forward("P2-1", 4)]);
    expect(getUnseenAnimationMoves(events, 2, 3)).toEqual([]);
  });

  it("expands a split seven into seven visible hops", () => {
    const steps = Array.from({ length: 7 }, (_, index) => forward(index < 3 ? "P1-1" : "P1-2", index + 1));
    const events: PublicGameEvent[] = [{
      revision: 8,
      actor: "P1",
      type: "play",
      card: { rank: "7", suit: "spades" },
      move: { kind: "split7", steps },
    }];

    expect(getUnseenAnimationMoves(events, 7, 8)).toEqual(steps);
  });

  it("keeps cards and their moves grouped in turn order", () => {
    const events: PublicGameEvent[] = [
      { revision: 4, actor: "P1", type: "discard", card: { rank: "10", suit: "hearts" } },
      { revision: 5, actor: "P2", type: "play", card: { rank: "5", suit: "clubs" }, move: forward("P2-1", 8) },
    ];

    expect(getUnseenAnimationTurns(events, 3, 5)).toEqual([
      { revision: 4, event: events[0], moves: [] },
      { revision: 5, event: events[1], moves: [forward("P2-1", 8)] },
    ]);
  });

  it("finds the latest card turn even when exchange events follow it", () => {
    const events: PublicGameEvent[] = [
      { revision: 4, actor: "P1", type: "play", card: { rank: "5", suit: "clubs" }, move: forward("P1-1", 5) },
      { revision: 5, actor: "P2", type: "exchange", card: null },
    ];

    expect(getLatestAnimationTurn(events)).toEqual({
      revision: 4,
      event: events[0],
      moves: [forward("P1-1", 5)],
    });
  });

  it("restores only the involved pieces to their pre-move positions", () => {
    const pieces: Piece[] = [
      { id: "P1-1", owner: "P1", position: { zone: "track", index: 8, isEntryProtected: false } },
      { id: "P2-1", owner: "P2", position: { zone: "reserve" } },
      { id: "P2-2", owner: "P2", position: { zone: "track", index: 11, isEntryProtected: false } },
    ];
    const event: PublicGameEvent = {
      revision: 6,
      actor: "P1",
      type: "play",
      card: { rank: "5", suit: "clubs" },
      move: { ...forward("P1-1", 8), capturedPieceId: "P2-1" },
      piecePositionsBefore: [
        { pieceId: "P1-1", position: { zone: "track", index: 3, isEntryProtected: false } },
        { pieceId: "P2-1", position: { zone: "track", index: 8, isEntryProtected: false } },
      ],
    };

    expect(getReplayStartingPieces(pieces, event)).toEqual([
      { id: "P1-1", owner: "P1", position: { zone: "track", index: 3, isEntryProtected: false } },
      { id: "P2-1", owner: "P2", position: { zone: "track", index: 8, isEntryProtected: false } },
      pieces[2],
    ]);
  });

  it("starts the visible center pile after the latest dealer reshuffle", () => {
    const events: PublicGameEvent[] = [
      { revision: 4, actor: "P1", type: "play", card: { rank: "5", suit: "clubs" }, startsNewDealerRound: true },
      { revision: 5, actor: "P2", type: "exchange", card: null },
      { revision: 6, actor: "P2", type: "discard", card: { rank: "9", suit: "hearts" } },
    ];

    expect(getCurrentDealerRoundEvents(events)).toEqual(events.slice(1));
  });
});
