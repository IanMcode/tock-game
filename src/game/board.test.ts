import { describe, expect, it } from "vitest";

import {
  HOME_SIZE,
  TRACK_SIZE,
  advanceHome,
  advanceTrackIndex,
  enterHome,
  getBackwardTrackPath,
  getEntryIndex,
  getForwardStepsToHome,
  getForwardTrackPath,
  getHomeEntranceIndex,
  getTrackIndex,
} from "./board";

describe("board geometry", () => {
  it("maps each player's 18-space section onto the 72-space track", () => {
    expect(TRACK_SIZE).toBe(72);
    expect(getTrackIndex("P1", 1)).toBe(0);
    expect(getTrackIndex("P1", 18)).toBe(17);
    expect(getTrackIndex("P2", 1)).toBe(18);
    expect(getTrackIndex("P3", 1)).toBe(36);
    expect(getTrackIndex("P4", 18)).toBe(71);
  });

  it("places entry at space 18 and the home entrance after space 16", () => {
    expect(getEntryIndex("P1")).toBe(getTrackIndex("P1", 18));
    expect(getHomeEntranceIndex("P1")).toBe(getTrackIndex("P1", 16));
    expect(getEntryIndex("P3")).toBe(getTrackIndex("P3", 18));
    expect(getHomeEntranceIndex("P3")).toBe(getTrackIndex("P3", 16));
  });

  it("moves clockwise and wraps around the track", () => {
    expect(advanceTrackIndex(71, 1)).toBe(0);
    expect(advanceTrackIndex(0, 72)).toBe(0);
    expect(getForwardTrackPath(70, 3)).toEqual([71, 0, 1]);
  });

  it("moves backward and wraps around the track", () => {
    expect(advanceTrackIndex(0, -1)).toBe(71);
    expect(getBackwardTrackPath(1, 3)).toEqual([0, 71, 70]);
  });

  it("finds home from either a full circuit or an early board position", () => {
    expect(getForwardStepsToHome(getEntryIndex("P1"), "P1")).toBe(71);
    expect(getForwardStepsToHome(getTrackIndex("P1", 14), "P1")).toBe(3);

    expect(
      enterHome(
        {
          zone: "track",
          index: getTrackIndex("P1", 14),
          isEntryProtected: false,
        },
        "P1",
        3,
      ),
    ).toEqual({ zone: "home", index: 0 });
  });

  it("requires an exact destination within the four-space home lane", () => {
    expect(HOME_SIZE).toBe(4);
    const approach = {
      zone: "track" as const,
      index: getHomeEntranceIndex("P2"),
      isEntryProtected: false,
    };

    expect(enterHome(approach, "P2", 1)).toEqual({ zone: "home", index: 0 });
    expect(enterHome(approach, "P2", 4)).toEqual({ zone: "home", index: 3 });
    expect(enterHome(approach, "P2", 5)).toBeNull();
    expect(advanceHome({ zone: "home", index: 1 }, 2)).toEqual({
      zone: "home",
      index: 3,
    });
    expect(advanceHome({ zone: "home", index: 2 }, 2)).toBeNull();
  });

  it("rejects invalid board coordinates and movement values", () => {
    expect(() => advanceTrackIndex(-1, 1)).toThrow(RangeError);
    expect(() => advanceTrackIndex(72, 1)).toThrow(RangeError);
    expect(() => getForwardTrackPath(0, -1)).toThrow(RangeError);
    expect(() => advanceHome({ zone: "home", index: 4 }, 1)).toThrow(
      RangeError,
    );
  });
});
