import { describe, expect, it } from "vitest";

import { advanceTrackIndex, getEntryIndex } from "./board";
import { createGame } from "./createGame";
import { getRulesetDefinition } from "./definition";
import { getControlledPlayer, getWinningTeam } from "./teams";
import type { Piece, PlayerId } from "./types";
import { assertValidGameState } from "./validation";

describe("two-to-four-player rulesets", () => {
  it.each([
    [2, "free-for-all-2", 36],
    [3, "free-for-all-3", 54],
    [4, "free-for-all-4", 72],
  ] as const)("creates a %i-player free-for-all", (playerCount, rulesetId, trackSize) => {
    const game = createGame({ playerCount, teams: false, shuffle: false, dealer: "P1" });
    const ruleset = getRulesetDefinition(game.rulesetId);

    expect(game.rulesetId).toBe(rulesetId);
    expect(game.players).toHaveLength(playerCount);
    expect(game.phase).toBe("play");
    expect(game.currentPlayer).toBe("P2");
    expect(ruleset.board.trackSize).toBe(trackSize);
    expect(game.players.every((player) => player.hand.length === 5)).toBe(true);
    assertValidGameState(game);
  });

  it("wraps movement on the selected smaller board", () => {
    const board = getRulesetDefinition("free-for-all-2").board;

    expect(getEntryIndex("P2", board)).toBe(35);
    expect(advanceTrackIndex(35, 1, board)).toBe(0);
  });

  it("awards a free-for-all victory to the first completed player", () => {
    const game = createGame({ playerCount: 3, teams: false, shuffle: false, dealer: "P1" });
    const pieces = game.players.flatMap((player) =>
      player.id === "P2" ? homePieces("P2") : player.pieces,
    );

    expect(getWinningTeam(pieces, game.rulesetId)).toEqual(["P2"]);
    expect(getControlledPlayer(pieces, "P2", game.rulesetId)).toBe("P2");
  });

  it("retains opposite-seat teammate control in four-player team games", () => {
    const game = createGame({ playerCount: 4, teams: true, shuffle: false, dealer: "P1" });
    const pieces = game.players.flatMap((player) =>
      player.id === "P1" ? homePieces("P1") : player.pieces,
    );

    expect(game.phase).toBe("exchange");
    expect(getControlledPlayer(pieces, "P1", game.rulesetId)).toBe("P3");
    expect(getWinningTeam(pieces, game.rulesetId)).toBeNull();
    expect(getWinningTeam([...pieces.filter((piece) => piece.owner !== "P3"), ...homePieces("P3")], game.rulesetId))
      .toEqual(["P1", "P3"]);
  });
});

function homePieces(playerId: PlayerId): Piece[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `${playerId}-${index + 1}`,
    owner: playerId,
    position: { zone: "home" as const, index },
  }));
}
