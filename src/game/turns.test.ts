import { describe, expect, it } from "vitest";

import { getEntryIndex } from "./board";
import { getLegalBasicCardMoves } from "./cardMoves";
import { createGame } from "./createGame";
import { getAllPieces } from "./occupancy";
import {
  discardCardForTurn,
  getPlayableCardIndexes,
  playCardForTurn,
} from "./turns";
import type { Card, GameState, PlayerId } from "./types";

function card(rank: Card["rank"]): Card {
  return { rank, suit: "clubs" };
}

function withHand(game: GameState, playerId: PlayerId, hand: Card[]): GameState {
  return {
    ...game,
    currentPlayer: playerId,
    phase: "play",
    exchangeSelections: {},
    players: game.players.map((player) =>
      player.id === playerId ? { ...player, hand } : player,
    ),
  };
}

describe("turn actions", () => {
  it("plays a legal Ace entry, discards the card, and advances the turn", () => {
    const game = withHand(
      createGame({ shuffle: false, startWithPieceOnEntry: false }),
      "P1",
      [card("A")],
    );
    const [move] = getLegalBasicCardMoves(getAllPieces(game), "P1", card("A"));
    const result = playCardForTurn(game, 0, move);

    expect(result.currentPlayer).toBe("P2");
    expect(result.players[0].hand).toEqual([]);
    expect(result.discardPile).toEqual([card("A")]);
    expect(result.players[0].pieces[0].position).toEqual({
      zone: "track",
      index: getEntryIndex("P1"),
      isEntryProtected: true,
    });
    expect(game.players[0].pieces[0].position).toEqual({ zone: "reserve" });
  });

  it("rejects a move that was not generated for the selected card", () => {
    const game = withHand(createGame({ shuffle: false }), "P1", [card("A")]);

    expect(() =>
      playCardForTurn(game, 0, {
        kind: "enter",
        pieceId: "P2-1",
        destination: {
          zone: "track",
          index: getEntryIndex("P2"),
          isEntryProtected: true,
        },
      }),
    ).toThrow("The selected move is not legal for that card.");
  });

  it("forces the next player to discard after a played 10", () => {
    let game = withHand(createGame({ shuffle: false }), "P1", [card("10")]);
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === "P1"
          ? {
              ...player,
              pieces: player.pieces.map((piece, index) =>
                index === 0
                  ? {
                      ...piece,
                      position: {
                        zone: "track" as const,
                        index: 0,
                        isEntryProtected: false,
                      },
                    }
                  : piece,
              ),
            }
          : player,
      ),
    };
    const [move] = getLegalBasicCardMoves(getAllPieces(game), "P1", card("10"));
    const result = playCardForTurn(game, 0, move);

    expect(result.currentPlayer).toBe("P2");
    expect(result.forcedDiscardPlayer).toBe("P2");
    expect(() => playCardForTurn(result, 0, move)).toThrow(
      "The current player must discard without moving.",
    );
  });

  it("chains a 10 discarded during a forced-discard turn", () => {
    let game = withHand(createGame({ shuffle: false }), "P2", [card("10")]);
    game = { ...game, currentPlayer: "P2", forcedDiscardPlayer: "P2" };

    const result = discardCardForTurn(game, 0);

    expect(result.currentPlayer).toBe("P3");
    expect(result.forcedDiscardPlayer).toBe("P3");
  });

  it("clears an empty-hand forced discard without carrying it forward", () => {
    let game = withHand(createGame({ shuffle: false }), "P2", []);
    game = { ...game, currentPlayer: "P2", forcedDiscardPlayer: "P2" };

    const result = discardCardForTurn(game, null);

    expect(result.currentPlayer).toBe("P3");
    expect(result.forcedDiscardPlayer).toBeNull();
  });

  it("allows discarding another card when a 5 is the only legal play", () => {
    let game = withHand(createGame({ shuffle: false }), "P1", [
      card("5"),
      card("2"),
    ]);
    game = {
      ...game,
      players: game.players.map((player) => ({
        ...player,
        pieces: player.pieces.map((piece) => ({
          ...piece,
          position: { zone: "reserve" as const },
        })),
      })),
    };
    game.players[1].pieces[0] = {
      ...game.players[1].pieces[0],
      position: { zone: "track", index: 20, isEntryProtected: false },
    };

    expect(getPlayableCardIndexes(game)).toEqual([0]);
    expect(discardCardForTurn(game, 1).discardPile.at(-1)).toEqual(card("2"));
    expect(() => discardCardForTurn(game, 0)).toThrow(
      "The current player has a legal card move and cannot discard.",
    );
  });
});
