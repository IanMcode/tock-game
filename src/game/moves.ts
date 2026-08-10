import {
  advanceHome,
  advanceTrackIndex,
  enterHome,
  getBackwardTrackPath,
  getForwardStepsToHome,
  getForwardTrackPath,
} from "./board";
import type { BoardDefinition } from "./definition";
import {
  getHomeOccupant,
  getPieceById,
  getTrackOccupant,
  isProtectedEntryPiece,
} from "./occupancy";
import type { HomePosition, Piece, TrackPosition } from "./types";

export type ForwardMove = {
  kind: "forward";
  pieceId: string;
  route: "track" | "home";
  destination: TrackPosition | HomePosition;
  capturedPieceId?: string;
};

export type BackwardMove = {
  kind: "backward";
  pieceId: string;
  route: "track";
  destination: TrackPosition;
  capturedPieceId?: string;
};

export function getLegalForwardMoves(
  pieces: readonly Piece[],
  pieceId: string,
  spaces: number,
  board?: BoardDefinition,
): ForwardMove[] {
  assertPositiveInteger(spaces);
  const piece = getPieceById(pieces, pieceId);

  if (!piece) {
    throw new Error(`Unknown piece: ${pieceId}`);
  }

  switch (piece.position.zone) {
    case "reserve":
      return [];
    case "home":
      return getHomeMoves(pieces, piece, piece.position, spaces, board);
    case "track":
      return getTrackMoves(pieces, piece, piece.position, spaces, board);
  }
}

export function getLegalBackwardMove(
  pieces: readonly Piece[],
  pieceId: string,
  spaces: number,
  board?: BoardDefinition,
): BackwardMove[] {
  assertPositiveInteger(spaces);
  const piece = getPieceById(pieces, pieceId);

  if (!piece) {
    throw new Error(`Unknown piece: ${pieceId}`);
  }

  if (piece.position.zone !== "track") {
    return [];
  }

  const path = getBackwardTrackPath(piece.position.index, spaces, board);

  if (hasProtectedBlocker(pieces, path, piece.id)) {
    return [];
  }

  const destinationIndex = advanceTrackIndex(piece.position.index, -spaces, board);
  const occupant = getTrackOccupant(pieces, destinationIndex, piece.id);

  return [
    {
      kind: "backward",
      pieceId: piece.id,
      route: "track",
      destination: {
        zone: "track",
        index: destinationIndex,
        isEntryProtected: false,
      },
      ...(occupant ? { capturedPieceId: occupant.id } : {}),
    },
  ];
}

function getTrackMoves(
  pieces: readonly Piece[],
  piece: Piece,
  position: TrackPosition,
  spaces: number,
  board?: BoardDefinition,
): ForwardMove[] {
  const moves: ForwardMove[] = [];
  const trackPath = getForwardTrackPath(position.index, spaces, board);

  if (!hasProtectedBlocker(pieces, trackPath, piece.id)) {
    const destinationIndex = advanceTrackIndex(position.index, spaces, board);
    const occupant = getTrackOccupant(pieces, destinationIndex, piece.id);

    moves.push({
      kind: "forward",
      pieceId: piece.id,
      route: "track",
      destination: {
        zone: "track",
        index: destinationIndex,
        isEntryProtected: false,
      },
      ...(occupant ? { capturedPieceId: occupant.id } : {}),
    });
  }

  const homeDestination = enterHome(position, piece.owner, spaces, board);

  if (
    homeDestination &&
    canEnterHome(pieces, piece, position, spaces, homeDestination, board)
  ) {
    moves.push({
      kind: "forward",
      pieceId: piece.id,
      route: "home",
      destination: homeDestination,
    });
  }

  return moves;
}

function getHomeMoves(
  pieces: readonly Piece[],
  piece: Piece,
  position: HomePosition,
  spaces: number,
  board?: BoardDefinition,
): ForwardMove[] {
  const destination = advanceHome(position, spaces, board);

  if (!destination) {
    return [];
  }

  for (let index = position.index + 1; index <= destination.index; index += 1) {
    if (getHomeOccupant(pieces, piece.owner, index, piece.id)) {
      return [];
    }
  }

  return [
    {
      kind: "forward",
      pieceId: piece.id,
      route: "home",
      destination,
    },
  ];
}

function canEnterHome(
  pieces: readonly Piece[],
  piece: Piece,
  position: TrackPosition,
  spaces: number,
  destination: HomePosition,
  board?: BoardDefinition,
): boolean {
  const stepsToHome = getForwardStepsToHome(position.index, piece.owner, board);
  const trackPath = getForwardTrackPath(position.index, stepsToHome - 1, board);

  if (spaces < stepsToHome || hasProtectedBlocker(pieces, trackPath, piece.id)) {
    return false;
  }

  for (let index = 0; index <= destination.index; index += 1) {
    if (getHomeOccupant(pieces, piece.owner, index, piece.id)) {
      return false;
    }
  }

  return true;
}

function hasProtectedBlocker(
  pieces: readonly Piece[],
  path: readonly number[],
  movingPieceId: string,
): boolean {
  return path.some((index) =>
    isProtectedEntryPiece(getTrackOccupant(pieces, index, movingPieceId)),
  );
}

function assertPositiveInteger(spaces: number): void {
  if (!Number.isInteger(spaces) || spaces <= 0) {
    throw new RangeError("Forward movement must use a positive whole number.");
  }
}
