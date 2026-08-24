import { Redis } from "@upstash/redis";

import { deserializeOnlineRoom, serializeOnlineRoom } from "./roomPersistence";
import type { OnlineRoom, RoomStore, StoredRoom } from "./roomService";

const ROOM_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const ROOM_KEY_PREFIX = "tock:room:v1:";

const CREATE_ROOM_SCRIPT = `
  if redis.call("EXISTS", KEYS[1]) == 1 then
    return 0
  end
  redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
  return 1
`;

const SAVE_ROOM_SCRIPT = `
  local current = redis.call("GET", KEYS[1])
  if not current then
    return 0
  end
  local decoded = cjson.decode(current)
  if tonumber(decoded.version) ~= tonumber(ARGV[1]) then
    return 0
  end
  redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
  return 1
`;

type RedisRoomRecord = {
  room: string;
  version: number;
};

export type UpstashRoomClient = {
  get(key: string): Promise<unknown>;
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
};

export class UpstashRoomStore implements RoomStore {
  private readonly redis: UpstashRoomClient;

  constructor(url: string, token: string, redis?: UpstashRoomClient) {
    if (!url.trim() || !token.trim()) {
      throw new Error("Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required.");
    }
    this.redis = redis ?? new Redis({ url, token, automaticDeserialization: false });
  }

  async get(roomId: string): Promise<StoredRoom | undefined> {
    const stored = await this.redis.get(roomKey(roomId));
    if (stored === null || stored === undefined) return undefined;
    const record = parseRedisRoomRecord(stored);
    return { room: deserializeOnlineRoom(record.room), version: record.version };
  }

  async create(room: OnlineRoom): Promise<boolean> {
    const result = await this.redis.eval(
      CREATE_ROOM_SCRIPT,
      [roomKey(room.id)],
      [serializeRedisRoomRecord(room, 0), ROOM_LIFETIME_SECONDS],
    );
    return Number(result) === 1;
  }

  async save(room: OnlineRoom, expectedVersion: number): Promise<boolean> {
    const result = await this.redis.eval(
      SAVE_ROOM_SCRIPT,
      [roomKey(room.id)],
      [expectedVersion, serializeRedisRoomRecord(room, expectedVersion + 1), ROOM_LIFETIME_SECONDS],
    );
    return Number(result) === 1;
  }
}

function roomKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId}`;
}

function serializeRedisRoomRecord(room: OnlineRoom, version: number): string {
  return JSON.stringify({ room: serializeOnlineRoom(room), version } satisfies RedisRoomRecord);
}

function parseRedisRoomRecord(value: unknown): RedisRoomRecord {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as Partial<RedisRoomRecord>).room !== "string" ||
    !Number.isSafeInteger((parsed as Partial<RedisRoomRecord>).version) ||
    (parsed as Partial<RedisRoomRecord>).version! < 0
  ) {
    throw new Error("The stored Redis room record is invalid.");
  }
  return parsed as RedisRoomRecord;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("The stored Redis room record is not valid JSON.");
  }
}
