import { jsonResponse, onlineErrorResponse } from "../../../src/online/http";
import { serverRoomService } from "../../../src/online/serverRoomService";
import { parseCreateRoomOptions } from "../../../src/online/protocol";

export const runtime = "nodejs";

export async function POST(request?: Request): Promise<Response> {
  try {
    const text = request ? await request.text() : "";
    const options = parseCreateRoomOptions(text ? JSON.parse(text) : undefined);
    return jsonResponse(serverRoomService.createRoom(options), { status: 201 });
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
