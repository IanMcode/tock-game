import { jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { serverRoomService } from "../../../../../src/online/serverRoomService";
import { parseJoinRoomOptions } from "../../../../../src/online/protocol";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/join">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const text = await request.text();
    const { playerName } = parseJoinRoomOptions(text ? JSON.parse(text) : undefined);
    return jsonResponse(await serverRoomService.joinRoom(roomId, playerName), { status: 201 });
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
