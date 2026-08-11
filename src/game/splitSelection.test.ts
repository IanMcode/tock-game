import { describe, expect, it } from "vitest";

import type { ForwardMove } from "./moves";
import type { SplitSevenMove } from "./specialMoves";
import { getSplitSevenDestinationOptions } from "./splitSelection";

function step(pieceId: string, index: number): ForwardMove {
  return {
    kind: "forward",
    pieceId,
    route: "track",
    destination: { zone: "track", index, isEntryProtected: false },
  };
}

describe("split 7 destination selection", () => {
  it("offers every reachable distance for the selected piece", () => {
    const move: SplitSevenMove = {
      kind: "split7",
      steps: Array.from({ length: 7 }, (_, index) => step("P1-1", index + 1)),
    };

    const options = getSplitSevenDestinationOptions([move], 0, "P1-1");

    expect(options.map((option) => option.steps.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(options.map((option) => option.destination.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("offers only the unassigned remainder", () => {
    const move: SplitSevenMove = {
      kind: "split7",
      steps: Array.from({ length: 7 }, (_, index) => step("P1-1", index + 1)),
    };

    const options = getSplitSevenDestinationOptions([move], 3, "P1-1");

    expect(options.map((option) => option.steps.length)).toEqual([1, 2, 3, 4]);
    expect(options.map((option) => option.destination.index)).toEqual([4, 5, 6, 7]);
  });

  it("stops a destination run when the split changes pieces", () => {
    const move: SplitSevenMove = {
      kind: "split7",
      steps: [
        step("P1-1", 1),
        step("P1-1", 2),
        step("P1-2", 20),
        step("P1-2", 21),
        step("P1-2", 22),
        step("P1-2", 23),
        step("P1-2", 24),
      ],
    };

    expect(getSplitSevenDestinationOptions([move], 0, "P1-1")).toHaveLength(2);
    expect(getSplitSevenDestinationOptions([move], 2, "P1-2")).toHaveLength(5);
  });
});
