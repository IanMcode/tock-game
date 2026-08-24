import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { parseCommandEnvelope } from "../../../../../src/online/protocol";
import { serverRoomService } from "../../../../../src/online/serverRoomService";
import { notifyRoomUpdated } from "../../../../../src/online/realtimeServer";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/commands">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const token = getBearerToken(request, true)!;
    const envelope = parseCommandEnvelope(await request.json());
    const room = await serverRoomService.submitCommand(roomId, token, envelope);
    await notifyRoomUpdated(room);
    return jsonResponse(room);
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
