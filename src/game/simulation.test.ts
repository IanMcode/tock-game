import { describe, expect, it, vi } from "vitest";

import { createGame } from "./createGame";
import { simulateGame, simulateNextAction } from "./simulation";
import { assertValidGameState } from "./validation";

describe("deterministic game simulations", () => {
  it("plays an entire hand through exchange and into the next deal", () => {
    let game = createGame({ shuffle: false, dealer: "P4" });
    const initialDeal = game.dealIndex;
    let actions = 0;

    while (game.dealIndex === initialDeal && actions < 100) {
      game = simulateNextAction(game);
      assertValidGameState(game);
      actions += 1;
    }

    expect(game.dealIndex).toBe(1);
    expect(game.phase).toBe("exchange");
    expect(actions).toBeLessThan(100);
  });

  it("plays from a fresh deal until one partner team wins", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.417);
    const result = simulateGame(
      createGame({ shuffle: false, dealer: "P4" }),
      20_000,
    );

    expect(result.game.winningTeam).not.toBeNull();
    expect(result.completedDeals).toBeGreaterThan(0);
    expect(result.actions).toBeLessThan(20_000);
    assertValidGameState(result.game);
  }, 30_000);

  it.each([2, 3, 4] as const)("plays a complete %i-player free-for-all", (playerCount) => {
    const result = simulateGame(
      createGame({
        playerCount,
        teams: false,
        randomState: 42_000 + playerCount,
        dealer: "P1",
      }),
      20_000,
    );

    expect(result.game.winningTeam).toHaveLength(1);
    expect(result.game.players).toHaveLength(playerCount);
    expect(result.completedDeals).toBeGreaterThan(0);
    assertValidGameState(result.game);
  }, 30_000);
});
