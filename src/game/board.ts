import type { HomePosition, PlayerId, TrackPosition } from "./types";

export const PLAYER_SECTION_SIZE = 18;
export const TRACK_SIZE = 72;
export const HOME_SIZE = 4;

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

const PLAYER_SECTION: Record<PlayerId, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
};

export function getTrackIndex(
  playerId: PlayerId,
  sectionSpace: SectionSpace,
): number {
  return PLAYER_SECTION[playerId] * PLAYER_SECTION_SIZE + sectionSpace - 1;
}

export function getEntryIndex(playerId: PlayerId): number {
  return getTrackIndex(playerId, 18);
}

export function getHomeEntranceIndex(playerId: PlayerId): number {
  return getTrackIndex(playerId, 16);
}

export function advanceTrackIndex(index: number, spaces: number): number {
  assertTrackIndex(index);

  if (!Number.isInteger(spaces)) {
    throw new RangeError("Track movement must use a whole number of spaces.");
  }

  return modulo(index + spaces, TRACK_SIZE);
}

export function getForwardTrackPath(index: number, spaces: number): number[] {
  assertTrackIndex(index);
  assertNonNegativeInteger(spaces, "Forward movement");

  return Array.from({ length: spaces }, (_, offset) =>
    advanceTrackIndex(index, offset + 1),
  );
}

export function getBackwardTrackPath(index: number, spaces: number): number[] {
  assertTrackIndex(index);
  assertNonNegativeInteger(spaces, "Backward movement");

  return Array.from({ length: spaces }, (_, offset) =>
    advanceTrackIndex(index, -(offset + 1)),
  );
}

export function getForwardStepsToHome(
  index: number,
  playerId: PlayerId,
): number {
  assertTrackIndex(index);
  const entranceIndex = getHomeEntranceIndex(playerId);

  return modulo(entranceIndex - index, TRACK_SIZE) + 1;
}

export function enterHome(
  position: TrackPosition,
  playerId: PlayerId,
  spaces: number,
): HomePosition | null {
  assertNonNegativeInteger(spaces, "Forward movement");
  const stepsToHome = getForwardStepsToHome(position.index, playerId);
  const homeIndex = spaces - stepsToHome;

  if (homeIndex < 0 || homeIndex >= HOME_SIZE) {
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
): HomePosition | null {
  assertHomeIndex(position.index);
  assertNonNegativeInteger(spaces, "Home movement");
  const index = position.index + spaces;

  if (index >= HOME_SIZE) {
    return null;
  }

  return {
    zone: "home",
    index,
  };
}

function assertTrackIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= TRACK_SIZE) {
    throw new RangeError(`Track index must be between 0 and ${TRACK_SIZE - 1}.`);
  }
}

function assertHomeIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= HOME_SIZE) {
    throw new RangeError(`Home index must be between 0 and ${HOME_SIZE - 1}.`);
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
