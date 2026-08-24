import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../src/online/http";
import { serverRoomService } from "../../../../src/online/serverRoomService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const token = getBearerToken(request, true);
    return jsonResponse(await serverRoomService.getRoomView(roomId, token));
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
