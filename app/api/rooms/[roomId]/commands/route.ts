import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { parseCommandEnvelope } from "../../../../../src/online/protocol";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/commands">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const token = getBearerToken(request, true)!;
    const envelope = parseCommandEnvelope(await request.json());
    return jsonResponse(await serverRoomService.submitCommand(roomId, token, envelope));
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
