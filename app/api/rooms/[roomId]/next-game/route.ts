import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { parseStartNextGameOptions } from "../../../../../src/online/protocol";
import { notifyRoomUpdated } from "../../../../../src/online/realtimeServer";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/next-game">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const result = await serverRoomService.startNextGame(
      roomId,
      getBearerToken(request, true)!,
      parseStartNextGameOptions(await request.json()),
    );
    await notifyRoomUpdated(result.room);
    return jsonResponse(result);
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
