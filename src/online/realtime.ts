export const ROOM_UPDATED_EVENT = "room-updated";
export const REALTIME_FALLBACK_REFRESH_DELAY = 30_000;

export function roomChannelName(roomId: string): string {
  return `tock:room:${roomId.trim()}`;
}

export function roomRealtimeClientId(roomId: string, playerId: string): string {
  return `room:${roomId.trim()}:${playerId}`;
}
