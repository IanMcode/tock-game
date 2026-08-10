import { jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/rooms/[roomId]/join">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    return jsonResponse(serverRoomService.joinRoom(roomId), { status: 201 });
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
