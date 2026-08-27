import { describe, expect, it } from "vitest";

import { getEntryIndex, getHomeEntranceIndex } from "../src/game/board";
import { BOARD_DEFINITIONS, getBoardTrackIndex } from "../src/game/definition";
import {
  getBoardPerspectiveRotation,
  getBoardReserveGridPoint,
  getBoardReserveGridRotation,
  getBoardReservePoint,
  getBoardTrackPoint,
  getBoardTurnMarkerPoint,
  getCardPipLayout,
  getDefaultPlayerAppearanceVariables,
  getHomeLanePoint,
  type BoardPoint,
} from "./game-table";

describe("default player appearance", () => {
  it("uses the highest-contrast colors first with readable pips and outlines", () => {
    expect(getDefaultPlayerAppearanceVariables()).toMatchObject({
      "--color-p1": "#111827",
      "--color-p1-ink": "#FFFFFF",
      "--color-p2": "#FFFFFF",
      "--color-p2-ink": "#111827",
      "--color-p2-edge": "#000000",
      "--color-p2-border-width": "2px",
      "--color-p2-label": "#111827",
      "--color-p3": "#0057B8",
      "--color-p3-ink": "#FFFFFF",
      "--color-p4": "#F2C94C",
      "--color-p4-ink": "#111827",
    });
  });
});

describe("playing card artwork", () => {
  it("renders the correct number of suit pips for aces and numbered cards", () => {
    expect(getCardPipLayout("A")).toHaveLength(1);
    (["2", "3", "4", "5", "6", "7", "8", "9", "10"] as const).forEach((rank, index) => {
      expect(getCardPipLayout(rank)).toHaveLength(index + 2);
    });
  });

  it("uses court artwork instead of pip layouts for face cards", () => {
    expect(getCardPipLayout("J")).toBeNull();
    expect(getCardPipLayout("Q")).toBeNull();
    expect(getCardPipLayout("K")).toBeNull();
  });
});

describe("player board perspective", () => {
  it("places each player's space 12 exactly on a corner", () => {
    const expectedCorners = {
      2: [{ x: 78, y: 90 }, { x: 22, y: 10 }],
      3: [{ x: 63.8564, y: 90 }, { x: 8.4308, y: 42 }, { x: 77.7128, y: 18 }],
      4: [
        { x: 60.187, y: 89 },
        { x: 11, y: 60.187 },
        { x: 39.813, y: 11 },
        { x: 89, y: 39.813 },
      ],
    } as const;

    for (const board of Object.values(BOARD_DEFINITIONS)) {
      board.playerIds.forEach((playerId, index) => {
        expect(getBoardTrackPoint(getBoardTrackIndex(board, playerId, 12), board)).toEqual(
          expectedCorners[board.playerCount][index],
        );
      });
    }
  });

  it("spaces every three-player track position evenly", () => {
    const board = BOARD_DEFINITIONS[3];
    const distances = Array.from({ length: board.trackSize }, (_, index) => {
      const point = getBoardTrackPoint(index, board);
      const next = getBoardTrackPoint((index + 1) % board.trackSize, board);
      return Math.hypot(next.x - point.x, next.y - point.y);
    });

    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(0.001);
  });

  it("spaces every four-player track position evenly", () => {
    const board = BOARD_DEFINITIONS[4];
    const distances = Array.from({ length: board.trackSize }, (_, index) => {
      const point = getBoardTrackPoint(index, board);
      const next = getBoardTrackPoint((index + 1) % board.trackSize, board);
      return Math.hypot(next.x - point.x, next.y - point.y);
    });

    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(0.001);
  });

  it("keeps three-player opponent reserves clear of the track", () => {
    const board = BOARD_DEFINITIONS[3];

    for (const playerId of board.playerIds) {
      const entry = getBoardTrackPoint(getEntryIndex(playerId, board), board);
      const reserve = getBoardReservePoint(playerId, board);
      expect(Math.hypot(reserve.x - entry.x, reserve.y - entry.y)).toBeGreaterThan(15);
    }
  });

  it("centers the turn marker beyond each player's 12–18 edge", () => {
    for (const board of Object.values(BOARD_DEFINITIONS)) {
      for (const playerId of board.playerIds) {
        const entry = getBoardTrackPoint(getEntryIndex(playerId, board), board);
        const spaceTwelve = getBoardTrackPoint(getBoardTrackIndex(board, playerId, 12), board);
        const midpoint = {
          x: (entry.x + spaceTwelve.x) / 2,
          y: (entry.y + spaceTwelve.y) / 2,
        };
        const marker = getBoardTurnMarkerPoint(playerId, board);
        expect(Math.hypot(marker.x - 50, marker.y - 50)).toBeGreaterThan(
          Math.hypot(midpoint.x - 50, midpoint.y - 50),
        );
        expect(Math.abs(
          (midpoint.x - 50) * (marker.y - midpoint.y)
          - (midpoint.y - 50) * (marker.x - midpoint.x),
        )).toBeLessThan(0.01);
        if (board.playerCount === 3) {
          expect(Math.hypot(marker.x - 50, marker.y - 50)).toBeCloseTo(47.2, 2);
        } else {
          expect(Math.min(marker.x, marker.y, 100 - marker.x, 100 - marker.y)).toBeLessThan(3);
        }
      }
    }
  });

  it("anchors three-player reserve grids beside home and clear of the 12–18 edge", () => {
    const board = BOARD_DEFINITIONS[3];

    for (const playerId of board.playerIds) {
      const rotation = getBoardPerspectiveRotation(playerId, board);
      const reserveGrid = rotatePoint(getBoardReserveGridPoint(playerId, board), rotation);
      const entry = rotatePoint(getBoardTrackPoint(getEntryIndex(playerId, board), board), rotation);
      const homeSpaces = Array.from({ length: board.homeSize }, (_, index) =>
        rotatePoint(getHomeLanePoint(playerId, index, board), rotation));
      const playerEdge = [18, 17, 16, 15, 14, 13, 12].map((space) =>
        rotatePoint(getBoardTrackPoint(getBoardTrackIndex(board, playerId, space), board), rotation));

      expect(reserveGrid.x).toBeGreaterThan(8);
      expect(reserveGrid.x).toBeLessThan(92);
      expect(reserveGrid.y).toBeGreaterThan(8);
      expect(reserveGrid.y).toBeLessThan(92);
      expect(reserveGrid.x).toBeGreaterThan(Math.max(...homeSpaces.map((point) => point.x)) + 8);
      expect(reserveGrid.y).toBeLessThan(entry.y - 7);
      expect(Math.min(...playerEdge.map((point) => Math.hypot(
        reserveGrid.x - point.x,
        reserveGrid.y - point.y,
      )))).toBeGreaterThan(8);
      expect(Math.min(...homeSpaces.map((point) => Math.hypot(
        reserveGrid.x - point.x,
        reserveGrid.y - point.y,
      )))).toBeGreaterThan(10);
    }
  });

  it("aligns three-player reserve grids with their board sectors", () => {
    const board = BOARD_DEFINITIONS[3];

    for (const viewer of board.playerIds) {
      const perspective = getBoardPerspectiveRotation(viewer, board);
      for (const owner of board.playerIds) {
        const screenRotation = perspective + getBoardReserveGridRotation(owner, board);
        const smallestRotation = Math.abs(((screenRotation + 180) % 360 + 360) % 360 - 180);
        expect(smallestRotation).toBeCloseTo(owner === viewer ? 0 : 120, 4);
      }
    }
  });

  it("pins three-player opponent reserves to safe screen-aligned slots", () => {
    const board = BOARD_DEFINITIONS[3];

    for (const viewer of board.playerIds) {
      const rotation = getBoardPerspectiveRotation(viewer, board);
      const opponents = board.playerIds.filter((playerId) => playerId !== viewer);
      const screenPoints = opponents.map((owner) => rotatePoint(
        getBoardReservePoint(owner, board, viewer),
        rotation,
      )).sort((left, right) => left.x - right.x);

      expect(screenPoints).toEqual([
        expect.objectContaining({ x: expect.closeTo(19, 3), y: expect.closeTo(8, 3) }),
        expect.objectContaining({ x: expect.closeTo(81, 3), y: expect.closeTo(8, 3) }),
      ]);
    }
  });

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
        const space12 = rotatePoint(
          getBoardTrackPoint(getBoardTrackIndex(board, playerId, 12), board),
          rotation,
        );

        expect(reserve.x).toBeCloseTo(entry.x, 1);
        expect(reserve.y).toBeGreaterThan(90);
        expect(entrance.y).toBeCloseTo(entry.y, 1);
        expect(entry.y).toBeGreaterThan(60);
        expect(firstHomeSpace.y).toBeLessThan(entrance.y);
        if (board.playerCount === 2 || board.playerCount === 3 || board.playerCount === 4) {
          expect(entry.x).toBeLessThan(space12.x);
          expect(entry.y).toBeCloseTo(space12.y, 1);
          const playerEdge = [18, 17, 16, 15, 14, 13, 12].map((space) => rotatePoint(
            getBoardTrackPoint(getBoardTrackIndex(board, playerId, space), board),
            rotation,
          ));
          expect(playerEdge.every((point) => Math.abs(point.y - entry.y) < 0.1)).toBe(true);
          expect(playerEdge.map((point) => point.x)).toEqual(
            [...playerEdge].map((point) => point.x).sort((left, right) => left - right),
          );
        }
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
