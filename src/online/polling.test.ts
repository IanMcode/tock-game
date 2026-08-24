import { describe, expect, it } from "vitest";

import { OnlineRequestError } from "./client";
import {
  failedRoomRefreshDelay,
  MAX_FAILED_ROOM_REFRESH_DELAY,
  shouldForgetRoomAfterError,
} from "./polling";

describe("online room polling policy", () => {
  it.each([
    [401, "INVALID_TOKEN"],
    [401, "PLAYER_TOKEN_REQUIRED"],
    [404, "ROOM_NOT_FOUND"],
  ])("forgets terminal room access after %i %s", (status, code) => {
    expect(shouldForgetRoomAfterError(new OnlineRequestError(status, code, "Terminal"))).toBe(true);
  });

  it("keeps access while backing off from temporary failures", () => {
    expect(shouldForgetRoomAfterError(new OnlineRequestError(400, "BAD_REQUEST", "Temporary"))).toBe(false);
    expect(shouldForgetRoomAfterError(new OnlineRequestError(500, "SERVER_ERROR", "Temporary"))).toBe(false);
  });

  it("backs off exponentially and caps at thirty seconds", () => {
    expect([1, 2, 3, 4, 5, 6].map(failedRoomRefreshDelay)).toEqual([
      1_500,
      3_000,
      6_000,
      12_000,
      24_000,
      MAX_FAILED_ROOM_REFRESH_DELAY,
    ]);
    expect(failedRoomRefreshDelay(20)).toBe(MAX_FAILED_ROOM_REFRESH_DELAY);
  });
});
