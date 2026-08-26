import { describe, expect, it } from "vitest";

import { getLobbyTeamNumber, moveLobbyPlayerToTeam, randomizeLobbySeats, randomizeLobbyTeamSeats } from "./lobbyTeams";

describe("lobby team assignment", () => {
  it("keeps two players on each opposite-seat team when a player changes teams", () => {
    const moved = moveLobbyPlayerToTeam(["P1", "P2", "P3", "P4"], "P1", 2);

    expect(getLobbyTeamNumber(moved, "P1")).toBe(2);
    expect(moved.filter((player) => getLobbyTeamNumber(moved, player) === 1)).toHaveLength(2);
    expect(moved.filter((player) => getLobbyTeamNumber(moved, player) === 2)).toHaveLength(2);
  });

  it("randomizes players while preserving two opposite-seat teams", () => {
    const values = [0.7, 0.1, 0.4];
    const randomized = randomizeLobbyTeamSeats(
      ["P1", "P2", "P3", "P4"],
      () => values.shift() ?? 0,
    );

    expect(new Set(randomized)).toEqual(new Set(["P1", "P2", "P3", "P4"]));
    expect([randomized[0], randomized[2]]).not.toEqual(["P1", "P3"]);
    expect(randomized.filter((player) => getLobbyTeamNumber(randomized, player) === 1)).toHaveLength(2);
    expect(randomized.filter((player) => getLobbyTeamNumber(randomized, player) === 2)).toHaveLength(2);
  });

  it("randomizes free-for-all board positions without leaving everyone in place", () => {
    expect(randomizeLobbySeats(["P1", "P2", "P3"], () => 0.99)).toEqual(["P2", "P3", "P1"]);
    expect(randomizeLobbySeats(["P1", "P2", "P3"], () => 0)).toEqual(["P2", "P3", "P1"]);
  });
});
