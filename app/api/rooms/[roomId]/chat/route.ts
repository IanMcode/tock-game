import { getBearerToken, jsonResponse, onlineErrorResponse } from "../../../../../src/online/http";
import { parseChatMessage } from "../../../../../src/online/protocol";
import { serverRoomService } from "../../../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rooms/[roomId]/chat">,
): Promise<Response> {
  try {
    const { roomId } = await context.params;
    const token = getBearerToken(request, true)!;
    const message = parseChatMessage(await request.json());
    return jsonResponse(await serverRoomService.submitChatMessage(
      roomId,
      token,
      message.messageId,
      message.text,
    ));
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
