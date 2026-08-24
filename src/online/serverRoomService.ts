import { InMemoryRoomStore, RoomService } from "./roomService";
import { NeonRoomStore } from "./neonRoomStore";
import { UpstashRoomStore } from "./upstashRoomStore";

const globalRooms = globalThis as typeof globalThis & {
  __tockRoomService?: RoomService;
};

const databaseUrl = process.env.DATABASE_URL;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export const serverRoomService = globalRooms.__tockRoomService ?? new RoomService(
  upstashUrl && upstashToken
    ? new UpstashRoomStore(upstashUrl, upstashToken)
    : databaseUrl
      ? new NeonRoomStore(databaseUrl)
      : new InMemoryRoomStore(),
);

globalRooms.__tockRoomService = serverRoomService;
