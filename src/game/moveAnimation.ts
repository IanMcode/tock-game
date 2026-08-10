import type { AtomicMove } from "./actions";
import {
  advanceTrackIndex,
  getForwardStepsToHome,
  TRACK_SIZE,
} from "./board";
import { getPieceById } from "./occupancy";
import type { HomePosition, Piece, TrackPosition } from "./types";

export type AnimatedPiecePosition = {
  pieceId: string;
  position: TrackPosition | HomePosition;
};

export type MoveAnimationFrame = AnimatedPiecePosition[];

export function getMoveAnimationFrames(
  pieces: readonly Piece[],
  move: AtomicMove,
): MoveAnimationFrame[] {
  if (move.kind === "swap") {
    return [[
      { pieceId: move.pieceId, position: move.destination },
      { pieceId: move.targetPieceId, position: move.targetDestination },
    ]];
  }

  const piece = getPieceById(pieces, move.pieceId);

  if (!piece) {
    throw new Error(`Unknown moving piece: ${move.pieceId}`);
  }

  if (move.kind === "enter") {
    return [[{ pieceId: move.pieceId, position: move.destination }]];
  }

  if (piece.position.zone === "reserve") {
    return [];
  }

  const positions = move.kind === "backward"
    ? getBackwardPositions(piece.position, move.destination)
    : getForwardPositions(piece.owner, piece.position, move.destination);

  return positions.map((position) => [{ pieceId: move.pieceId, position }]);
}

function getBackwardPositions(
  start: TrackPosition | HomePosition,
  destination: TrackPosition,
): TrackPosition[] {
  if (start.zone !== "track") return [];

  const spaces = modulo(start.index - destination.index, TRACK_SIZE);
  return Array.from({ length: spaces }, (_, index) => ({
    zone: "track",
    index: advanceTrackIndex(start.index, -(index + 1)),
    isEntryProtected: false,
  }));
}

function getForwardPositions(
  owner: Piece["owner"],
  start: TrackPosition | HomePosition,
  destination: TrackPosition | HomePosition,
): Array<TrackPosition | HomePosition> {
  if (start.zone === "home") {
    if (destination.zone !== "home") return [];

    return Array.from(
      { length: destination.index - start.index },
      (_, index) => ({ zone: "home", index: start.index + index + 1 }),
    );
  }

  if (destination.zone === "track") {
    const spaces = modulo(destination.index - start.index, TRACK_SIZE);
    return Array.from({ length: spaces }, (_, index) => ({
      zone: "track",
      index: advanceTrackIndex(start.index, index + 1),
      isEntryProtected: false,
    }));
  }

  const stepsToHome = getForwardStepsToHome(start.index, owner);
  const totalSpaces = stepsToHome + destination.index;

  return Array.from({ length: totalSpaces }, (_, index) => {
    const step = index + 1;

    if (step < stepsToHome) {
      return {
        zone: "track" as const,
        index: advanceTrackIndex(start.index, step),
        isEntryProtected: false,
      };
    }

    return { zone: "home" as const, index: step - stepsToHome };
  });
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}
