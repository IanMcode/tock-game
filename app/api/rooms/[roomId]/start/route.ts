import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { parseStartRoomOptions } from "../../../../../src/online/protocol";
import { notifyRoomUpdated } from "../../../../../src/online/realtimeServer";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/start">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const text = await request.text();
    const result = await serverRoomService.startRoom(
      roomId,
      getBearerToken(request, true)!,
      parseStartRoomOptions(text ? JSON.parse(text) : undefined),
    );
    await notifyRoomUpdated(result.room);
    return jsonResponse(result);
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
