import { InMemoryRoomStore, RoomService } from "./roomService";
import { NeonRoomStore } from "./neonRoomStore";

const globalRooms = globalThis as typeof globalThis & {
  __tockRoomService?: RoomService;
};

const databaseUrl = process.env.DATABASE_URL;

export const serverRoomService = globalRooms.__tockRoomService ?? new RoomService(
  databaseUrl ? new NeonRoomStore(databaseUrl) : new InMemoryRoomStore(),
);

globalRooms.__tockRoomService = serverRoomService;
