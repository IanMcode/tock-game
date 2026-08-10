import { describe, expect, it } from "vitest";

import { createGame } from "./createGame";
import { applySessionCommand, createGameSession } from "./session";
import { createSessionView } from "./view";

describe("player-specific session views", () => {
  it("shows a player only their own hand", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const view = createSessionView(session, "P1");

    expect(view.game.players.find((player) => player.id === "P1")?.hand).toEqual(
      session.game.players.find((player) => player.id === "P1")?.hand,
    );
    expect(
      view.game.players
        .filter((player) => player.id !== "P1")
        .every((player) => player.hand === undefined),
    ).toBe(true);
    expect(view.game.drawPileCount).toBe(session.game.drawPile.length);
    expect(view.game).not.toHaveProperty("drawPile");
  });

  it("shows spectators no private hands", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const view = createSessionView(session, null);

    expect(view.viewer).toBeNull();
    expect(view.game.players.every((player) => player.hand === undefined)).toBe(true);
  });

  it("reveals exchange completion but not selected indexes", () => {
    const initial = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const session = applySessionCommand(initial, {
      commandId: "exchange-p1",
      expectedRevision: 0,
      command: { type: "select-exchange-card", actor: "P1", cardIndex: 3 },
    });
    const view = createSessionView(session, "P2");

    expect(view.game.exchangeSelections).toEqual({ P1: true });
    expect(JSON.stringify(view.game.exchangeSelections)).not.toContain("3");
  });

  it("returns copies that cannot mutate the authoritative state", () => {
    const session = createGameSession("ROOM01", createGame({ shuffle: false, dealer: "P4" }));
    const view = createSessionView(session, "P1");
    view.game.players[0].pieces[0].position = { zone: "reserve" };
    view.game.players[0].hand?.splice(0);

    expect(session.game.players[0].pieces[0].position.zone).toBe("track");
    expect(session.game.players[0].hand).toHaveLength(5);
  });
});
