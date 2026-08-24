import { jsonResponse, onlineErrorResponse } from "../../../src/online/http";
import { serverRoomService } from "../../../src/online/serverRoomService";
import { parseCreateRoomOptions } from "../../../src/online/protocol";
import { notifyRoomUpdated } from "../../../src/online/realtimeServer";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const text = await request.text();
    const options = parseCreateRoomOptions(text ? JSON.parse(text) : undefined);
    const result = await serverRoomService.createRoom(options);
    await notifyRoomUpdated(result.room);
    return jsonResponse(result, { status: 201 });
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
