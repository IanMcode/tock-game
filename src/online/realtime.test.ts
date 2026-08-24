import { describe, expect, it } from "vitest";

import { roomChannelName, roomRealtimeClientId } from "./realtime";
import { roomRealtimeTokenParams } from "./realtimeServer";

describe("online realtime identifiers", () => {
  it("scopes channels and clients to one room", () => {
    expect(roomChannelName(" 1234 ")).toBe("tock:room:1234");
    expect(roomRealtimeClientId(" 1234 ", "P2")).toBe("room:1234:P2");
  });

  it("grants a player subscribe-only access to the exact room channel", () => {
    expect(roomRealtimeTokenParams("1234", "P2")).toEqual({
      capability: { "tock:room:1234": ["subscribe"] },
      clientId: "room:1234:P2",
      ttl: 3_600_000,
    });
  });
});
