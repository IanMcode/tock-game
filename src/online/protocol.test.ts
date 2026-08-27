import { describe, expect, it } from "vitest";

import { parseCommandEnvelope, parseCreateRoomOptions, parseJoinRoomOptions, parseStartNextGameOptions, parseStartRoomOptions } from "./protocol";

describe("online command protocol", () => {
  it("parses room rules and dealer selection", () => {
    expect(parseCreateRoomOptions({ playerCount: 3, teams: false, dealer: "P2" })).toEqual({
      playerCount: 3,
      teams: false,
      dealer: "P2",
      randomizeSeats: false,
      startWithPieceOnEntry: true,
      charityTurns: 0,
    });
    expect(parseCreateRoomOptions(undefined)).toEqual({});
  });

  it("parses in-room next-game options", () => {
    expect(parseStartNextGameOptions({ dealer: "P3", randomizeSeats: true })).toEqual({
      dealer: "P3",
      randomizeSeats: true,
    });
    expect(() => parseStartNextGameOptions({ dealer: "P9" })).toThrow("valid player");
  });

  it("parses a host's initial seat arrangement", () => {
    expect(parseStartRoomOptions({
      dealer: "P2",
      seatOrder: ["P1", "P3", "P2", "P4"],
    })).toEqual({ dealer: "P2", seatOrder: ["P1", "P3", "P2", "P4"] });
    expect(() => parseStartRoomOptions({ seatOrder: ["P1", "P1"] })).toThrow("same player");
  });

  it("rejects invalid room combinations", () => {
    expect(() => parseCreateRoomOptions({ playerCount: 2, teams: true })).toThrow("requires four players");
    expect(() => parseCreateRoomOptions({ playerCount: 2, dealer: "P3" })).toThrow("not seated");
    expect(() => parseCreateRoomOptions({ randomizeSeats: "yes" })).toThrow("must be true or false");
  });

  it("normalizes player names at the network boundary", () => {
    expect(parseCreateRoomOptions({ playerName: "  Omi   Friend  " }).playerName).toBe("Omi Friend");
    expect(parseJoinRoomOptions({ playerName: "Ian" })).toEqual({ playerName: "Ian" });
    expect(() => parseJoinRoomOptions({ playerName: "" })).toThrow("Enter a player name");
    expect(() => parseJoinRoomOptions({ playerName: "x".repeat(25) })).toThrow("24 characters");
  });

  it("parses supported command envelopes", () => {
    expect(parseCommandEnvelope({
      commandId: "command-1",
      expectedRevision: 3,
      command: { type: "discard-card", actor: "P2", cardIndex: null },
    })).toEqual({
      commandId: "command-1",
      expectedRevision: 3,
      command: { type: "discard-card", actor: "P2", cardIndex: null },
    });
  });

  it("rejects malformed commands at the network boundary", () => {
    expect(() => parseCommandEnvelope(null)).toThrow("envelope must be an object");
    expect(() => parseCommandEnvelope({
      commandId: "command-1",
      expectedRevision: 0,
      command: { type: "discard-card", actor: "P9", cardIndex: 0 },
    })).toThrow("actor is not a valid player");
    expect(() => parseCommandEnvelope({
      commandId: "command-1",
      expectedRevision: 0,
      command: { type: "play-card", actor: "P1", cardIndex: 0 },
    })).toThrow("requires a move object");
  });
});
