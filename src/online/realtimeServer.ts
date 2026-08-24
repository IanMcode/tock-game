import { Rest, type TokenParams, type TokenRequest } from "ably";

import type { PlayerId } from "../game/types";
import type { RoomView } from "./roomService";
import { ROOM_UPDATED_EVENT, roomChannelName, roomRealtimeClientId } from "./realtime";
import { getAblyApiKey } from "./environment";

const TOKEN_LIFETIME_MS = 60 * 60 * 1_000;

const globalRealtime = globalThis as typeof globalThis & {
  __tockAblyRest?: Rest;
};

export function isRealtimeConfigured(): boolean {
  return Boolean(getAblyApiKey());
}

export async function createRoomRealtimeToken(
  roomId: string,
  playerId: PlayerId,
): Promise<TokenRequest> {
  return getAblyRest().auth.createTokenRequest(roomRealtimeTokenParams(roomId, playerId));
}

export function roomRealtimeTokenParams(roomId: string, playerId: PlayerId): TokenParams {
  const channelName = roomChannelName(roomId);
  return {
    capability: { [channelName]: ["subscribe"] },
    clientId: roomRealtimeClientId(roomId, playerId),
    ttl: TOKEN_LIFETIME_MS,
  };
}

export async function notifyRoomUpdated(room: RoomView): Promise<void> {
  if (!isRealtimeConfigured()) return;
  try {
    await getAblyRest().channels.get(roomChannelName(room.id)).publish(ROOM_UPDATED_EVENT, {
      revision: room.session.revision,
      status: room.status,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Unable to publish the room update to Ably.", error);
  }
}

function getAblyRest(): Rest {
  if (globalRealtime.__tockAblyRest) return globalRealtime.__tockAblyRest;
  const apiKey = getAblyApiKey();
  if (!apiKey) throw new Error("ABLY_API_KEY is not configured.");
  const client = new Rest(apiKey);
  globalRealtime.__tockAblyRest = client;
  return client;
}
