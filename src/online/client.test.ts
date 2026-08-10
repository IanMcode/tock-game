import { describe, expect, it, vi } from "vitest";

import { createOnlineRoom, readOnlineRoom } from "./client";

describe("online browser client", () => {
  it("sends room configuration as JSON", async () => {
    const request = vi.fn(async () => Response.json({ access: {}, room: {} }, { status: 201 }));
    await createOnlineRoom({ playerCount: 3, teams: false, dealer: "P2" }, request as typeof fetch);

    expect(request).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ playerCount: 3, teams: false, dealer: "P2" }),
    }));
  });

  it("uses a Bearer token when reconnecting", async () => {
    const request = vi.fn(async () => Response.json({}));
    await readOnlineRoom("ROOM 1", "secret", request as typeof fetch);

    expect(request).toHaveBeenCalledWith("/api/rooms/ROOM%201", expect.objectContaining({
      headers: { authorization: "Bearer secret" },
    }));
  });

  it("surfaces API error messages", async () => {
    const request = vi.fn(async () => Response.json({
      error: { message: "Room is full." },
    }, { status: 409 }));

    await expect(readOnlineRoom("FULL", undefined, request as typeof fetch)).rejects.toThrow("Room is full");
  });
});
