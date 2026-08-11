import { describe, expect, it } from "vitest";

import {
  BOARD_DEFINITIONS,
  CLASSIC_PARTNERS_RULESET,
  getBoardDefinition,
  getBoardEntryIndex,
  getBoardHomeEntranceIndex,
  getBoardTrackIndex,
  createDealSchedule,
  getRulesetForOptions,
} from "./definition";

describe("configurable board definitions", () => {
  it.each([
    [2, 36],
    [3, 54],
    [4, 72],
  ] as const)("defines a %i-player board with %i track spaces", (playerCount, trackSize) => {
    const board = getBoardDefinition(playerCount);

    expect(board.playerIds).toHaveLength(playerCount);
    expect(board.trackSize).toBe(trackSize);
    expect(board.homeSize).toBe(4);
    expect(board.piecesPerPlayer).toBe(4);
  });

  it("derives entries and home entrances from each board", () => {
    const board = BOARD_DEFINITIONS[3];

    expect(getBoardTrackIndex(board, "P1", 1)).toBe(0);
    expect(getBoardEntryIndex(board, "P2")).toBe(35);
    expect(getBoardHomeEntranceIndex(board, "P3")).toBe(51);
  });

  it("rejects players who are not seated on a smaller board", () => {
    expect(() => getBoardEntryIndex(BOARD_DEFINITIONS[2], "P3")).toThrow("not seated");
  });

  it("keeps the enabled classic ruleset on the four-seat definition", () => {
    expect(CLASSIC_PARTNERS_RULESET.board).toBe(BOARD_DEFINITIONS[4]);
    expect(CLASSIC_PARTNERS_RULESET.teams).toEqual([["P1", "P3"], ["P2", "P4"]]);
    expect(CLASSIC_PARTNERS_RULESET.dealSchedule).toEqual([5, 4, 4]);
  });

  it("maximizes deck use with a four-card minimum and an optional five-card opener", () => {
    expect(createDealSchedule(2)).toEqual([5, 4, 4, 4, 4, 4]);
    expect(createDealSchedule(3)).toEqual([5, 4, 4, 4]);
    expect(createDealSchedule(4)).toEqual([5, 4, 4]);
  });

  it("allows teams only on the opposite-seat four-player ruleset", () => {
    expect(getRulesetForOptions(2, false).id).toBe("free-for-all-2");
    expect(getRulesetForOptions(3, false).id).toBe("free-for-all-3");
    expect(getRulesetForOptions(4, false).id).toBe("free-for-all-4");
    expect(getRulesetForOptions(4, true).teams).toEqual([["P1", "P3"], ["P2", "P4"]]);
    expect(() => getRulesetForOptions(2, true)).toThrow("requires four players");
  });
});
