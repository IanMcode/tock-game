import { HttpError, getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import {
  createRoomRealtimeToken,
  isRealtimeConfigured,
} from "../../../../../src/online/realtimeServer";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/realtime-token">,
): Promise<Response> {
  try {
    if (!isRealtimeConfigured()) {
      throw new HttpError(503, "REALTIME_UNAVAILABLE", "Realtime room updates are not configured.");
    }
    const { roomId } = await context.params;
    const playerToken = getBearerToken(request, true)!;
    const room = await serverRoomService.getRoomView(roomId, playerToken);
    if (!room.session.viewer) {
      throw new HttpError(401, "INVALID_TOKEN", "The player token is not valid for this room.");
    }
    return jsonResponse(await createRoomRealtimeToken(room.id, room.session.viewer));
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
