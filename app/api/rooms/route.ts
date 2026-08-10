import { jsonResponse, onlineErrorResponse } from "../../../src/online/http";
import { serverRoomService } from "../../../src/online/serverRoomService";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  try {
    return jsonResponse(serverRoomService.createRoom(), { status: 201 });
  } catch (error) {
    return onlineErrorResponse(error);
  }
}
