import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { deserializeOnlineRoom, serializeOnlineRoom } from "./roomPersistence";
import type { OnlineRoom, RoomStore, StoredRoom } from "./roomService";

const ROOM_LIFETIME_DAYS = 7;

type RoomRow = {
  room: unknown;
  version: number;
};

export class NeonRoomStore implements RoomStore {
  private readonly sql: NeonQueryFunction<false, false>;
  private schemaReady: Promise<void> | null = null;

  constructor(connectionString: string) {
    if (!connectionString.trim()) throw new Error("DATABASE_URL must not be empty.");
    this.sql = neon(connectionString);
  }

  async get(roomId: string): Promise<StoredRoom | undefined> {
    await this.ensureSchema();
    const rows = await this.sql`
      SELECT room, version
      FROM tock_rooms
      WHERE room_id = ${roomId} AND expires_at > NOW()
      LIMIT 1
    ` as RoomRow[];
    const row = rows[0];
    if (!row) return undefined;
    return { room: deserializeOnlineRoom(row.room), version: row.version };
  }

  async create(room: OnlineRoom): Promise<boolean> {
    await this.ensureSchema();
    const serialized = serializeOnlineRoom(room);
    const rows = await this.sql`
      INSERT INTO tock_rooms (room_id, version, room, expires_at)
      VALUES (
        ${room.id},
        0,
        ${serialized}::jsonb,
        NOW() + (${ROOM_LIFETIME_DAYS} * INTERVAL '1 day')
      )
      ON CONFLICT (room_id) DO UPDATE
      SET version = 0,
          room = EXCLUDED.room,
          updated_at = NOW(),
          expires_at = EXCLUDED.expires_at
      WHERE tock_rooms.expires_at <= NOW()
      RETURNING room_id
    ` as { room_id: string }[];
    return rows.length === 1;
  }

  async save(room: OnlineRoom, expectedVersion: number): Promise<boolean> {
    await this.ensureSchema();
    const serialized = serializeOnlineRoom(room);
    const rows = await this.sql`
      UPDATE tock_rooms
      SET version = version + 1,
          room = ${serialized}::jsonb,
          updated_at = NOW(),
          expires_at = NOW() + (${ROOM_LIFETIME_DAYS} * INTERVAL '1 day')
      WHERE room_id = ${room.id}
        AND version = ${expectedVersion}
        AND expires_at > NOW()
      RETURNING room_id
    ` as { room_id: string }[];
    return rows.length === 1;
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.createSchema().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS tock_rooms (
        room_id VARCHAR(6) PRIMARY KEY,
        version INTEGER NOT NULL CHECK (version >= 0),
        room JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS tock_rooms_expires_at_idx
      ON tock_rooms (expires_at)
    `;
  }
}
