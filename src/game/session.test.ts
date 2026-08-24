import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import { getLegalBasicCardMoves } from "./cardMoves";
import { getRulesetDefinition } from "./definition";
import {
  applySessionCommand,
  createGameSession,
  SessionCommandError,
  type CommandEnvelope,
} from "./session";
import { PLAYER_IDS } from "./types";

describe("authoritative game sessions", () => {
  it("applies an authorized command and advances the revision", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const next = applySessionCommand(session, exchange("cmd-1", 0, "P1", 0));

    expect(next.revision).toBe(1);
    expect(next.events).toEqual([expect.objectContaining({ commandId: "cmd-1", revision: 1 })]);
    expect(next.game.exchangeSelections.P1).toBe(0);
    expect(session.revision).toBe(0);
  });

  it("records the public card used for a turn without changing the command", () => {
    const game = {
      ...createGame({ playerCount: 2, teams: false, shuffle: false, dealer: "P2" }),
      forcedDiscardPlayer: "P1" as const,
    };
    const session = createGameSession("ROOM01", game);
    const card = game.players[0].hand[0];
    const next = applySessionCommand(session, {
      commandId: "discard-1",
      expectedRevision: 0,
      command: { type: "discard-card", actor: "P1", cardIndex: 0 },
    });

    expect(next.events[0].card).toEqual(card);
    expect(next.events[0].command).toEqual({ type: "discard-card", actor: "P1", cardIndex: 0 });
  });

  it("records the pre-move positions needed for a local visual replay", () => {
    const game = createGame({ playerCount: 2, teams: false, shuffle: false, dealer: "P2" });
    const player = game.players[0];
    const cardIndex = player.hand.findIndex((card) =>
      getLegalBasicCardMoves(player.pieces.concat(game.players[1].pieces), "P1", card, game.rulesetId).length > 0);
    const card = player.hand[cardIndex];
    const move = getLegalBasicCardMoves(
      game.players.flatMap((candidate) => candidate.pieces),
      "P1",
      card,
      game.rulesetId,
    )[0];
    const session = createGameSession("ROOM01", game);
    const next = applySessionCommand(session, {
      commandId: "play-1",
      expectedRevision: 0,
      command: { type: "play-card", actor: "P1", cardIndex, move },
    });

    expect(next.events[0].piecePositionsBefore).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pieceId: move.kind === "split7" ? move.steps[0].pieceId : move.pieceId,
      }),
    ]));
  });

  it("marks the final turn before the dealer rotates and the deck reshuffles", () => {
    const created = createGame({ playerCount: 2, teams: false, shuffle: false, dealer: "P2" });
    const deck = [...created.players.flatMap((player) => player.hand), ...created.drawPile];
    const finalCard = deck[0];
    const game = {
      ...created,
      currentPlayer: "P1" as const,
      forcedDiscardPlayer: "P1" as const,
      dealIndex: getRulesetDefinition(created.rulesetId).dealSchedule.length - 1,
      drawPile: [],
      discardPile: deck.slice(1),
      players: created.players.map((player) => ({
        ...player,
        hand: player.id === "P1" ? [finalCard] : [],
      })),
    };
    const session = createGameSession("ROOM01", game);
    const next = applySessionCommand(session, {
      commandId: "final-discard",
      expectedRevision: 0,
      command: { type: "discard-card", actor: "P1", cardIndex: 0 },
    });

    expect(next.game.dealer).not.toBe(game.dealer);
    expect(next.events[0].startsNewDealerRound).toBe(true);
  });

  it("returns the existing session when the same command is retried", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const command = exchange("cmd-1", 0, "P1", 0);
    const applied = applySessionCommand(session, command);

    expect(applySessionCommand(applied, command)).toBe(applied);
  });

  it("rejects a reused command ID with different content", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const applied = applySessionCommand(session, exchange("cmd-1", 0, "P1", 0));

    expectCommandError(
      () => applySessionCommand(applied, exchange("cmd-1", 1, "P2", 0)),
      "COMMAND_ID_CONFLICT",
    );
  });

  it("rejects stale revisions", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));

    expectCommandError(
      () => applySessionCommand(session, exchange("cmd-1", 2, "P1", 0)),
      "REVISION_CONFLICT",
    );
  });

  it("rejects a play command from someone other than the current player", () => {
    let session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    for (const [index, actor] of PLAYER_IDS.entries()) {
      session = applySessionCommand(session, exchange(`exchange-${actor}`, index, actor, 0));
    }

    expect(session.game.currentPlayer).toBe("P1");
    expectCommandError(
      () => applySessionCommand(session, {
        commandId: "wrong-player",
        expectedRevision: session.revision,
        command: { type: "discard-card", actor: "P2", cardIndex: 0 },
      }),
      "NOT_YOUR_TURN",
    );
  });
});

function exchange(
  commandId: string,
  expectedRevision: number,
  actor: "P1" | "P2" | "P3" | "P4",
  cardIndex: number,
): CommandEnvelope {
  return {
    commandId,
    expectedRevision,
    command: { type: "select-exchange-card", actor, cardIndex },
  };
}

function expectCommandError(run: () => unknown, code: SessionCommandError["code"]) {
  try {
    run();
    throw new Error("Expected the command to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SessionCommandError);
    expect((error as SessionCommandError).code).toBe(code);
  }
}
