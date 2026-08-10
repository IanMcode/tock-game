import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import { assertValidGameState, getGameStateProblems } from "./validation";

describe("complete game-state validation", () => {
  it("accepts a newly created game", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });

    expect(getGameStateProblems(game)).toEqual([]);
    expect(() => assertValidGameState(game)).not.toThrow();
  });

  it("reports duplicate board occupancy and a missing card", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });
    game.players[1].pieces[0] = {
      ...game.players[1].pieces[0],
      position: game.players[0].pieces[0].position,
    };
    game.drawPile = game.drawPile.slice(1);

    expect(getGameStateProblems(game)).toEqual(expect.arrayContaining([
      expect.stringContaining("More than one piece occupies"),
      expect.stringContaining("complete 52-card deck"),
    ]));
    expect(() => assertValidGameState(game)).toThrow("Invalid game state");
  });

  it("rejects protection away from an owner's entry", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });
    game.players[0].pieces[0] = {
      ...game.players[0].pieces[0],
      position: { zone: "track", index: 2, isEntryProtected: true },
    };

    expect(getGameStateProblems(game)).toContain("P1-1 is protected away from its entry.");
  });
});
