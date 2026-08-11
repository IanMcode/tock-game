import type { HomePosition, PlayerId, TrackPosition } from "./types";
import {
  type BoardDefinition,
  CLASSIC_PARTNERS_RULESET,
  getBoardEntryIndex,
  getBoardHomeEntranceIndex,
  getBoardTrackIndex,
} from "./definition";

const CLASSIC_BOARD = CLASSIC_PARTNERS_RULESET.board;
export const DEFAULT_BOARD = CLASSIC_BOARD;

export const PLAYER_SECTION_SIZE = CLASSIC_BOARD.sectionSize;
export const TRACK_SIZE = CLASSIC_BOARD.trackSize;
export const HOME_SIZE = CLASSIC_BOARD.homeSize;

export type SectionSpace =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

export function getTrackIndex(
  playerId: PlayerId,
  sectionSpace: SectionSpace,
  board: BoardDefinition = CLASSIC_BOARD,
): number {
  return getBoardTrackIndex(board, playerId, sectionSpace);
}

export function getEntryIndex(playerId: PlayerId, board: BoardDefinition = CLASSIC_BOARD): number {
  return getBoardEntryIndex(board, playerId);
}

export function getHomeEntranceIndex(playerId: PlayerId, board: BoardDefinition = CLASSIC_BOARD): number {
  return getBoardHomeEntranceIndex(board, playerId);
}

export function advanceTrackIndex(index: number, spaces: number, board: BoardDefinition = CLASSIC_BOARD): number {
  assertTrackIndex(index, board);

  if (!Number.isInteger(spaces)) {
    throw new RangeError("Track movement must use a whole number of spaces.");
  }

  return modulo(index + spaces, board.trackSize);
}

export function getForwardTrackPath(index: number, spaces: number, board: BoardDefinition = CLASSIC_BOARD): number[] {
  assertTrackIndex(index, board);
  assertNonNegativeInteger(spaces, "Forward movement");

  return Array.from({ length: spaces }, (_, offset) =>
    advanceTrackIndex(index, offset + 1, board),
  );
}

export function getBackwardTrackPath(index: number, spaces: number, board: BoardDefinition = CLASSIC_BOARD): number[] {
  assertTrackIndex(index, board);
  assertNonNegativeInteger(spaces, "Backward movement");

  return Array.from({ length: spaces }, (_, offset) =>
    advanceTrackIndex(index, -(offset + 1), board),
  );
}

export function getForwardStepsToHome(
  index: number,
  playerId: PlayerId,
  board: BoardDefinition = CLASSIC_BOARD,
): number {
  assertTrackIndex(index, board);
  const entranceIndex = getHomeEntranceIndex(playerId, board);

  return modulo(entranceIndex - index, board.trackSize) + 1;
}

export function enterHome(
  position: TrackPosition,
  playerId: PlayerId,
  spaces: number,
  board: BoardDefinition = CLASSIC_BOARD,
): HomePosition | null {
  assertNonNegativeInteger(spaces, "Forward movement");
  const stepsToHome = getForwardStepsToHome(position.index, playerId, board);
  const homeIndex = spaces - stepsToHome;

  if (homeIndex < 0 || homeIndex >= board.homeSize) {
    return null;
  }

  return {
    zone: "home",
    index: homeIndex,
  };
}

export function advanceHome(
  position: HomePosition,
  spaces: number,
  board: BoardDefinition = CLASSIC_BOARD,
): HomePosition | null {
  assertHomeIndex(position.index, board);
  assertNonNegativeInteger(spaces, "Home movement");
  const index = position.index + spaces;

  if (index >= board.homeSize) {
    return null;
  }

  return {
    zone: "home",
    index,
  };
}

function assertTrackIndex(index: number, board: BoardDefinition): void {
  if (!Number.isInteger(index) || index < 0 || index >= board.trackSize) {
    throw new RangeError(`Track index must be between 0 and ${board.trackSize - 1}.`);
  }
}

function assertHomeIndex(index: number, board: BoardDefinition): void {
  if (!Number.isInteger(index) || index < 0 || index >= board.homeSize) {
    throw new RangeError(`Home index must be between 0 and ${board.homeSize - 1}.`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must use a non-negative whole number.`);
  }
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
