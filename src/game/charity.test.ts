import { describe, expect, it } from "vitest";

import { getEntryIndex, getTrackIndex } from "./board";
import {
  isCharityQualifyingTurn,
  requestCharityCard,
  returnCharityCard,
  settleCharityCountsAfterHand,
  updateCharityEligibilityAfterTurn,
} from "./charity";
import { createGame } from "./createGame";
import { advanceDealIfHandComplete } from "./deals";
import { applySessionCommand, createGameSession } from "./session";
import type { CardRank, GameState, PlayerId } from "./types";
import { createSessionView } from "./view";

describe("charity rule", () => {
  it("counts a card-turn when the only available movement stays inside home", () => {
    const game = createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 2 });
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

    expect(isCharityQualifyingTurn(homeOnly)).toBe(true);
  });

  it("does not let a 5 moving another player's piece break hand eligibility", () => {
    const game = createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 1 });
    const otherPlayerOnly = {
      ...game,
      currentPlayer: "P1" as const,
      players: game.players.map((player) => ({
        ...player,
        hand: player.id === "P1" ? [{ rank: "5" as const, suit: "clubs" as const }] : player.hand,
        pieces: player.pieces.map((piece, index) => player.id === "P2" && index === 0
          ? { ...piece, position: { zone: "track" as const, index: 20, isEntryProtected: false } }
          : { ...piece, position: { zone: "reserve" as const } }),
      })),
    };

    expect(isCharityQualifyingTurn(otherPlayerOnly)).toBe(true);
  });

  it("counts normal movement of a partner after the player's own pieces are home", () => {
    const game = createGame({ shuffle: false, charityTurns: 1 });
    const helpingPartner = {
      ...game,
      currentPlayer: "P1" as const,
      players: game.players.map((player) => ({
        ...player,
        hand: player.id === "P1" ? [{ rank: "2" as const, suit: "clubs" as const }] : player.hand,
        pieces: player.pieces.map((piece, index) => {
          if (player.id === "P1") return { ...piece, position: { zone: "home" as const, index } };
          if (player.id === "P3" && index === 0) return {
            ...piece,
            position: { zone: "track" as const, index: 20, isEntryProtected: false },
          };
          return piece;
        }),
      })),
    };

    expect(isCharityQualifyingTurn(helpingPartner)).toBe(false);
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

  it("evaluates normal move availability even during a forced discard", () => {
    const game = createGame({ playerCount: 2, teams: false, shuffle: false, charityTurns: 1 });
    const forced = {
      ...game,
      currentPlayer: "P1" as const,
      phase: "play" as const,
      forcedDiscardPlayer: "P1" as const,
      players: game.players.map((player) => player.id === "P1" ? {
        ...player,
        hand: [{ rank: "2" as const, suit: "clubs" as const }],
      } : player),
    };

    expect(isCharityQualifyingTurn(forced)).toBe(false);
    expect(updateCharityEligibilityAfterTurn(forced).P1).toBe(false);
  });

  it("settles at most one point per completed hand and resets a broken streak", () => {
    const game = createGame({ playerCount: 3, teams: false, shuffle: false, charityTurns: 3 });
    const settled = settleCharityCountsAfterHand({
      ...game,
      charityCounts: { P1: 1, P2: 2, P3: 1 },
      charityHandEligible: { P1: true, P2: true, P3: false },
    });

    expect(settled).toEqual({ P1: 2, P2: 3, P3: 0 });
  });

  it("queues simultaneous requests clockwise before the partner exchange", () => {
    const game = createGame({ shuffle: false, dealer: "P1", charityTurns: 1 });
    const completed = advanceDealIfHandComplete({
      ...game,
      phase: "play",
      players: game.players.map((player) => ({ ...player, hand: [] })),
      discardPile: game.players.flatMap((player) => player.hand),
      charityHandEligible: { P1: true, P2: false, P3: true, P4: false },
    });

    expect(completed.phase).toBe("charity");
    expect(completed.currentPlayer).toBe("P3");
    expect(completed.charityCounts).toEqual({ P1: 1, P2: 0, P3: 1, P4: 0 });
    expect(completed.charityRequestQueue).toEqual(["P3", "P1"]);

    const missingRank = findMissingRank(completed, ["P2", "P4"]);
    const secondRequest = requestCharityCard(completed, "P3", missingRank);
    expect(secondRequest.currentPlayer).toBe("P1");
    const readyToExchange = requestCharityCard(secondRequest, "P1", missingRank);
    expect(readyToExchange.phase).toBe("exchange");
    expect(readyToExchange.currentPlayer).toBe("P2");
  });

  it("skips every player with charity progress and every simultaneous requester", () => {
    let game = queuedGame({ playerCount: 4, threshold: 1, queue: ["P1", "P2"] });
    const first = requestCharityCard(game, "P1", "J");

    expect(first.charityExchange?.donor).toBe("P3");
    game = returnCharityCard(first, "P1", 0);
    expect(game.currentPlayer).toBe("P2");

    const second = requestCharityCard(game, "P2", "A");
    expect(second.charityExchange?.donor).toBe("P3");

    const belowThreshold = queuedGame({ playerCount: 3, threshold: 2, queue: ["P1"] });
    belowThreshold.charityCounts.P2 = 1;
    belowThreshold.players[1].hand[0] = { rank: "6", suit: "clubs" };
    belowThreshold.players[2].hand[0] = { rank: "6", suit: "diamonds" };
    expect(requestCharityCard(belowThreshold, "P1", "6").charityExchange?.donor).toBe("P3");
  });

  it("takes the requested rank and privately returns an original card", () => {
    const game = queuedGame({ playerCount: 2, threshold: 1, queue: ["P1"] });
    const requested = requestCharityCard(game, "P1", "6");

    expect(requested.charityExchange).toMatchObject({ requester: "P1", donor: "P2", requestedRank: "6" });
    expect(requested.players.find((player) => player.id === "P1")?.hand).toHaveLength(6);
    expect(requested.players.find((player) => player.id === "P2")?.hand).toHaveLength(4);
    expect(() => returnCharityCard(requested, "P1", 5)).toThrow("original cards");

    const completed = returnCharityCard(requested, "P1", 0);
    expect(completed.phase).toBe("play");
    expect(completed.charityExchange).toBeNull();
    expect(completed.charityCounts.P1).toBe(0);
    expect(completed.players.every((player) => player.hand.length === 5)).toBe(true);
  });

  it("uses and resets the request when nobody eligible holds that rank", () => {
    const game = queuedGame({ playerCount: 2, threshold: 1, queue: ["P1"] });
    const requested = requestCharityCard(game, "P1", "K");

    expect(requested.phase).toBe("play");
    expect(requested.charityExchange).toBeNull();
    expect(requested.charityCounts.P1).toBe(0);
  });

  it("can retain the threshold for another hand when repeat charity is enabled", () => {
    const game = {
      ...queuedGame({ playerCount: 2, threshold: 1, queue: ["P1"] }),
      charityRepeatAtThreshold: true,
    };
    const requested = requestCharityCard(game, "P1", "K");

    expect(requested.charityCounts.P1).toBe(1);
    expect(settleCharityCountsAfterHand({
      ...requested,
      charityHandEligible: { P1: true, P2: false },
    }).P1).toBe(1);
  });

  it("publishes the donor without revealing private hands", () => {
    const game = queuedGame({ playerCount: 2, threshold: 1, queue: ["P1"] });
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

function queuedGame({
  playerCount,
  threshold,
  queue,
}: {
  playerCount: 2 | 3 | 4;
  threshold: 1 | 2 | 3;
  queue: PlayerId[];
}): GameState {
  const game = createGame({
    playerCount,
    teams: false,
    shuffle: false,
    dealer: playerCount === 2 ? "P2" : playerCount === 3 ? "P3" : "P4",
    charityTurns: threshold,
  });
  const counts = Object.fromEntries(queue.map((playerId) => [playerId, threshold]));
  return {
    ...game,
    currentPlayer: queue[0],
    phase: "charity",
    exchangeSelections: {},
    charityCounts: counts,
    charityRequestQueue: queue,
    charityRequestIndex: 0,
  };
}

function findMissingRank(game: GameState, playerIds: PlayerId[]): CardRank {
  const heldRanks = new Set(game.players
    .filter((player) => playerIds.includes(player.id))
    .flatMap((player) => player.hand.map((card) => card.rank)));
  return (["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const)
    .find((rank) => !heldRanks.has(rank))!;
}
