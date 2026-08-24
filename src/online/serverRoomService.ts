import { InMemoryRoomStore, RoomService } from "./roomService";
import { NeonRoomStore } from "./neonRoomStore";
import { UpstashRoomStore } from "./upstashRoomStore";
import { getUpstashEnvironment } from "./environment";

const globalRooms = globalThis as typeof globalThis & {
  __tockRoomService?: RoomService;
};

const databaseUrl = process.env.DATABASE_URL;
const { url: upstashUrl, token: upstashToken } = getUpstashEnvironment();

export const serverRoomService = globalRooms.__tockRoomService ?? new RoomService(
  upstashUrl && upstashToken
    ? new UpstashRoomStore(upstashUrl, upstashToken)
    : databaseUrl
      ? new NeonRoomStore(databaseUrl)
      : new InMemoryRoomStore(),
);

globalRooms.__tockRoomService = serverRoomService;
