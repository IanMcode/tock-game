import { describe, expect, it } from "vitest";

import { getEntryIndex, getTrackIndex } from "./board";
import { isCharityQualifyingTurn, requestCharityCard, returnCharityCard } from "./charity";
import { createGame } from "./createGame";
import { applySessionCommand, createGameSession } from "./session";
import { createSessionView } from "./view";

describe("charity rule", () => {
  it("counts a turn when the only available movement stays inside home", () => {
    const game = createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 2 });
    const player = game.players.find((candidate) => candidate.id === "P1")!;
    const homeOnly = {
      ...game,
      currentPlayer: "P1" as const,
      players: game.players.map((candidate) => candidate.id === "P1" ? {
        ...candidate,
        hand: [{ rank: "2" as const, suit: "clubs" as const }],
        pieces: candidate.pieces.map((piece, index) => index === 0
          ? { ...piece, position: { zone: "home" as const, index: 0 } }
          : piece),
      } : candidate),
    };

    expect(player).toBeTruthy();
    expect(isCharityQualifyingTurn(homeOnly)).toBe(true);
  });

  it("does not count being blocked solely by a protected entry", () => {
    const game = createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 2 });
    const blocked = {
      ...game,
      currentPlayer: "P1" as const,
      players: game.players.map((player) => ({
        ...player,
        hand: player.id === "P1" ? [{ rank: "2" as const, suit: "clubs" as const }] : player.hand,
        pieces: player.pieces.map((piece, index) => {
          if (player.id === "P1" && index === 0) return {
            ...piece,
            position: { zone: "track" as const, index: getTrackIndex("P2", 16), isEntryProtected: false },
          };
          if (player.id === "P2" && index === 0) return {
            ...piece,
            position: { zone: "track" as const, index: getEntryIndex("P2"), isEntryProtected: true },
          };
          return piece;
        }),
      })),
    };

    expect(isCharityQualifyingTurn(blocked)).toBe(false);
  });

  it("takes the requested rank from the first clockwise holder and returns an original card", () => {
    const game = {
      ...createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 1 }),
      currentPlayer: "P1" as const,
      charityCounts: { P1: 1 },
    };
    const requested = requestCharityCard(game, "P1", "6");

    expect(requested.charityExchange).toMatchObject({ requester: "P1", donor: "P2", requestedRank: "6" });
    expect(requested.players.find((player) => player.id === "P1")?.hand).toHaveLength(6);
    expect(requested.players.find((player) => player.id === "P2")?.hand).toHaveLength(4);
    expect(() => returnCharityCard(requested, "P1", 5)).toThrow("original cards");

    const completed = returnCharityCard(requested, "P1", 0);
    expect(completed.charityExchange).toBeNull();
    expect(completed.charityCounts.P1).toBe(0);
    expect(completed.players.every((player) => player.hand.length === 5)).toBe(true);
  });

  it("uses the one request even when nobody holds that rank", () => {
    const game = {
      ...createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 1 }),
      currentPlayer: "P1" as const,
      charityCounts: { P1: 1 },
    };
    const requested = requestCharityCard(game, "P1", "K");

    expect(requested.charityExchange).toBeNull();
    expect(requested.charityCounts.P1).toBe(0);
  });

  it("publishes the donor without revealing private hands", () => {
    const game = {
      ...createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 1 }),
      currentPlayer: "P1" as const,
      charityCounts: { P1: 1 },
    };
    const session = applySessionCommand(createGameSession("charity", game), {
      commandId: "request",
      expectedRevision: 0,
      command: { type: "request-charity-card", actor: "P1", rank: "6" },
    });
    const view = createSessionView(session, "P2");

    expect(view.events.at(-1)).toMatchObject({ type: "charity-request", charityRank: "6", charityDonor: "P2" });
    expect(view.game.charityExchange).toEqual({ requester: "P1", donor: "P2", requestedRank: "6" });
    expect(view.game.players.find((player) => player.id === "P1")?.hand).toBeUndefined();
  });
});
