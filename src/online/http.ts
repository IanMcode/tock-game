import { SessionCommandError } from "../game/session";
import { RoomError } from "./roomService";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function getBearerToken(request: Request, required: boolean): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    if (required) throw new HttpError(401, "PLAYER_TOKEN_REQUIRED", "A player token is required.");
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) {
    throw new HttpError(401, "INVALID_AUTHORIZATION", "Use a Bearer player token.");
  }
  return match[1];
}

export function onlineErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status });
  }

  if (error instanceof RoomError) {
    const status = {
      ROOM_NOT_FOUND: 404,
      ROOM_FULL: 409,
      ROOM_NOT_READY: 409,
      INVALID_TOKEN: 401,
      SEAT_MISMATCH: 403,
    }[error.code];
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status });
  }

  if (error instanceof SessionCommandError) {
    const status = error.code === "REVISION_CONFLICT" || error.code === "COMMAND_ID_CONFLICT"
      ? 409
      : error.code === "NOT_YOUR_TURN" ? 403 : 400;
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status });
  }

  return jsonResponse({
    error: {
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "The request could not be processed.",
    },
  }, { status: 400 });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
