import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { parseRoomConfiguration } from "../../../../../src/online/protocol";
import { notifyRoomUpdated } from "../../../../../src/online/realtimeServer";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/configuration">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const room = await serverRoomService.updateRoomConfiguration(
      roomId,
      getBearerToken(request, true)!,
      parseRoomConfiguration(await request.json()),
    );
    await notifyRoomUpdated(room);
    return jsonResponse(room);
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
