import type { CommandEnvelope } from "../game/session";
import type { TokenRequest } from "ably";
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
  playerName?: string,
  request: OnlineFetch = fetch,
): Promise<RoomJoinResult> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(playerName ? { playerName } : {}),
  });
}

export async function readOnlineRoom(
  roomId: string,
  playerToken: string,
  request: OnlineFetch = fetch,
): Promise<RoomView> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}`, {
    headers: { authorization: `Bearer ${playerToken}` },
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

export async function sendOnlineChat(
  roomId: string,
  playerToken: string,
  message: { messageId: string; text: string },
  request: OnlineFetch = fetch,
): Promise<RoomView> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}/chat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${playerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });
}

export async function requestRoomRealtimeToken(
  roomId: string,
  playerToken: string,
  request: OnlineFetch = fetch,
): Promise<TokenRequest> {
  return requestJson(request, `/api/rooms/${encodeURIComponent(roomId)}/realtime-token`, {
    method: "POST",
    headers: { authorization: `Bearer ${playerToken}` },
  });
}

async function requestJson<T>(request: OnlineFetch, input: string, init?: RequestInit): Promise<T> {
  const response = await request(input, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const code = typeof error?.code === "string" ? error.code : "ONLINE_REQUEST_FAILED";
    const message = typeof error?.message === "string" ? error.message : undefined;
    throw new OnlineRequestError(
      response.status,
      code,
      message ?? `Online request failed with status ${response.status}.`,
    );
  }
  return body as T;
}

export class OnlineRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OnlineRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
