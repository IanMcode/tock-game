import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import {
  advanceDealIfHandComplete,
  FOUR_PLAYER_DEAL_SCHEDULE,
  selectExchangeCard,
} from "./deals";
import { getPlayableCardIndexes } from "./turns";
import type { Card, GameState, PlayerId } from "./types";

function finishHands(game: GameState, cards: Card[]): GameState {
  return {
    ...game,
    phase: "play",
    players: game.players.map((player) => ({ ...player, hand: [] })),
    discardPile: cards,
  };
}

function selectForEveryone(
  game: GameState,
  selections: Partial<Record<PlayerId, number>> = {},
): GameState {
  return (["P1", "P2", "P3", "P4"] as const).reduce(
    (current, playerId) =>
      selectExchangeCard(current, playerId, selections[playerId] ?? 0),
    game,
  );
}

describe("four-player deal lifecycle", () => {
  it("starts with five cards, a chosen dealer, and the left player leading", () => {
    const game = createGame({ shuffle: false, dealer: "P2" });

    expect(FOUR_PLAYER_DEAL_SCHEDULE).toEqual([5, 4, 4]);
    expect(game.players.map((player) => player.hand.length)).toEqual([
      5, 5, 5, 5,
    ]);
    expect(game.drawPile).toHaveLength(32);
    expect(game.dealer).toBe("P2");
    expect(game.currentPlayer).toBe("P3");
    expect(game.phase).toBe("exchange");
    expect(getPlayableCardIndexes(game)).toEqual([]);
  });

  it("keeps exchange choices hidden in state until everyone selects", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });
    const originalHands = game.players.map((player) => player.hand);
    const partial = selectExchangeCard(game, "P1", 1);

    expect(partial.phase).toBe("exchange");
    expect(partial.exchangeSelections).toEqual({ P1: 1 });
    expect(partial.players.map((player) => player.hand)).toEqual(originalHands);
  });

  it("locks a player's first exchange choice in the engine", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });
    const partial = selectExchangeCard(game, "P1", 1);

    expect(() => selectExchangeCard(partial, "P1", 2)).toThrow(
      "P1 has already chosen a card for this exchange.",
    );
  });

  it("simultaneously exchanges the selected cards between partners", () => {
    const game = createGame({ shuffle: false, dealer: "P4" });
    const sentByP1 = game.players[0].hand[1];
    const sentByP3 = game.players[2].hand[2];
    const result = selectForEveryone(game, { P1: 1, P3: 2 });

    expect(result.phase).toBe("play");
    expect(result.exchangeSelections).toEqual({});
    expect(result.players[0].hand[1]).toEqual(sentByP3);
    expect(result.players[2].hand[2]).toEqual(sentByP1);
  });

  it("deals four cards for each of the next two hands", () => {
    let game = createGame({ shuffle: false, dealer: "P4" });
    game = advanceDealIfHandComplete(finishHands(game, game.discardPile));

    expect(game.dealIndex).toBe(1);
    expect(game.players.every((player) => player.hand.length === 4)).toBe(true);
    expect(game.drawPile).toHaveLength(16);
    expect(game.phase).toBe("exchange");

    game = selectForEveryone(game);
    game = advanceDealIfHandComplete(finishHands(game, game.discardPile));

    expect(game.dealIndex).toBe(2);
    expect(game.players.every((player) => player.hand.length === 4)).toBe(true);
    expect(game.drawPile).toHaveLength(0);
  });

  it("reshuffles all discards and rotates the dealer after the third hand", () => {
    let game = createGame({ shuffle: false, dealer: "P4" });
    const fullDeck = [
      ...game.players.flatMap((player) => player.hand),
      ...game.drawPile,
    ];
    game = {
      ...game,
      dealIndex: 2,
      drawPile: [],
      phase: "play",
      players: game.players.map((player) => ({ ...player, hand: [] })),
      discardPile: fullDeck,
      forcedDiscardPlayer: "P1",
    };

    const result = advanceDealIfHandComplete(game);

    expect(result.dealer).toBe("P1");
    expect(result.currentPlayer).toBe("P2");
    expect(result.dealIndex).toBe(0);
    expect(result.players.every((player) => player.hand.length === 5)).toBe(true);
    expect(result.drawPile).toHaveLength(32);
    expect(result.discardPile).toEqual([]);
    expect(result.forcedDiscardPlayer).toBeNull();
    expect(result.phase).toBe("exchange");
  });
});
