import { describe, expect, it } from "vitest";

import { getEntryIndex, getHomeEntranceIndex } from "../src/game/board";
import { BOARD_DEFINITIONS } from "../src/game/definition";
import {
  getBoardPerspectiveRotation,
  getBoardReservePoint,
  getBoardTrackPoint,
  getHomeLanePoint,
  type BoardPoint,
} from "./game-table";

describe("player board perspective", () => {
  it("places every player's seat, entry, and home lane at the bottom of each board size", () => {
    for (const board of Object.values(BOARD_DEFINITIONS)) {
      for (const playerId of board.playerIds) {
        const rotation = getBoardPerspectiveRotation(playerId, board);
        const reserve = rotatePoint(getBoardReservePoint(playerId, board), rotation);
        const entrance = rotatePoint(
          getBoardTrackPoint(getHomeEntranceIndex(playerId, board), board),
          rotation,
        );
        const entry = rotatePoint(
          getBoardTrackPoint(getEntryIndex(playerId, board), board),
          rotation,
        );
        const firstHomeSpace = rotatePoint(getHomeLanePoint(playerId, 0, board), rotation);

        expect(reserve.x).toBeCloseTo(entry.x, 1);
        expect(reserve.y).toBeGreaterThan(90);
        expect(entrance.y).toBeCloseTo(entry.y, 1);
        expect(entry.y).toBeGreaterThan(60);
        expect(firstHomeSpace.y).toBeLessThan(entrance.y);
      }
    }
  });
});

function rotatePoint(point: BoardPoint, degrees: number): BoardPoint {
  const radians = degrees * Math.PI / 180;
  const x = point.x - 50;
  const y = point.y - 50;
  return {
    x: 50 + x * Math.cos(radians) - y * Math.sin(radians),
    y: 50 + x * Math.sin(radians) + y * Math.cos(radians),
  };
}
