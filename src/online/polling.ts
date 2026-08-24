import { OnlineRequestError } from "./client";

export const ACTIVE_ROOM_REFRESH_DELAY = 750;
export const MAX_FAILED_ROOM_REFRESH_DELAY = 30_000;

const TERMINAL_ROOM_ERROR_CODES = new Set([
  "INVALID_AUTHORIZATION",
  "INVALID_TOKEN",
  "PLAYER_TOKEN_REQUIRED",
  "ROOM_NOT_FOUND",
]);

export function shouldForgetRoomAfterError(error: unknown): boolean {
  return error instanceof OnlineRequestError && TERMINAL_ROOM_ERROR_CODES.has(error.code);
}

export function failedRoomRefreshDelay(consecutiveFailures: number): number {
  const exponent = Math.max(1, Math.floor(consecutiveFailures));
  return Math.min(ACTIVE_ROOM_REFRESH_DELAY * (2 ** exponent), MAX_FAILED_ROOM_REFRESH_DELAY);
}
