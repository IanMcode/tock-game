import { InMemoryRoomStore, RoomService } from "./roomService";

const globalRooms = globalThis as typeof globalThis & {
  __tockRoomService?: RoomService;
};

export const serverRoomService = globalRooms.__tockRoomService ?? new RoomService(
  new InMemoryRoomStore(),
);

if (process.env.NODE_ENV !== "production") {
  globalRooms.__tockRoomService = serverRoomService;
}
