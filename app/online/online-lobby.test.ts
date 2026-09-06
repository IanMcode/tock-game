import { describe, expect, it } from "vitest";

import type { MatchGameRecord } from "../../src/online/roomService";
import { getGameTeamStatistics, getMatchTeamTotals } from "./online-lobby";

describe("online team statistics", () => {
  const game: MatchGameRecord = {
    gameNumber: 1,
    winnerParticipantIds: ["person-1", "person-3"],
    teamParticipantIds: [["person-1", "person-3"], ["person-2", "person-4"]],
    completedAt: 1,
    players: [
      { playerId: "P1", seatId: "P1", participantId: "person-1", playerName: "Ian", jacksPlayed: 1, outCardsPlayed: 2, timesEliminated: 3, eliminations: 4, eliminatedPlayers: { P2: 4 } },
      { playerId: "P2", seatId: "P2", participantId: "person-2", playerName: "Jon", jacksPlayed: 2, outCardsPlayed: 3, timesEliminated: 4, eliminations: 5, eliminatedPlayers: { P1: 5 } },
      { playerId: "P3", seatId: "P3", participantId: "person-3", playerName: "Jan", jacksPlayed: 3, outCardsPlayed: 4, timesEliminated: 5, eliminations: 6, eliminatedPlayers: { P4: 6 } },
      { playerId: "P4", seatId: "P4", participantId: "person-4", playerName: "Omi", jacksPlayed: 4, outCardsPlayed: 5, timesEliminated: 6, eliminations: 7, eliminatedPlayers: { P3: 7 } },
    ],
  };

  it("combines teammates for one game", () => {
    expect(getGameTeamStatistics(game)).toEqual([
      { teamId: "person-1:person-3", playerNames: ["Ian", "Jan"], won: true, gamesWon: 1, jacksPlayed: 4, outCardsPlayed: 6, timesEliminated: 8, eliminations: 10 },
      { teamId: "person-2:person-4", playerNames: ["Jon", "Omi"], won: false, gamesWon: 0, jacksPlayed: 6, outCardsPlayed: 8, timesEliminated: 10, eliminations: 12 },
    ]);
  });

  it("adds team results across a match without double-counting the first game", () => {
    const secondGame = { ...game, gameNumber: 2, completedAt: 2 };
    expect(getMatchTeamTotals([game, secondGame])[0]).toMatchObject({
      gamesWon: 2,
      jacksPlayed: 8,
      outCardsPlayed: 12,
      timesEliminated: 16,
      eliminations: 20,
    });
  });
});
