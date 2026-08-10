import type { CommandEnvelope } from "../game/session";
import type { CreateRoomOptions, RoomJoinResult, RoomView } from "./roomService";

export type OnlineFetch = typeof fetch;

export async function createOnlineRoom(
  options: CreateRoomOptions,
  request: OnlineFetch = fetch,
): Promise<RoomJoinResult> {
  return requestJson(request, "/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });
}

export async function joinOnlineRoom(
  roomId: string,
  request: OnlineFetch = fetch,
): Promise<RoomJoinResult> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST" });
}

export async function readOnlineRoom(
  roomId: string,
  playerToken?: string,
  request: OnlineFetch = fetch,
): Promise<RoomView> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}`, {
    headers: playerToken ? { authorization: `Bearer ${playerToken}` } : undefined,
  });
}

export async function sendOnlineCommand(
  roomId: string,
  playerToken: string,
  envelope: CommandEnvelope,
  request: OnlineFetch = fetch,
): Promise<RoomView> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}/commands`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${playerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(envelope),
  });
}

async function requestJson<T>(request: OnlineFetch, input: string, init?: RequestInit): Promise<T> {
  const response = await request(input, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const message = typeof error?.message === "string" ? error.message : undefined;
    throw new Error(message ?? `Online request failed with status ${response.status}.`);
  }
  return body as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
