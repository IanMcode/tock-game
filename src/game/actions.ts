import { getEntryIndex } from "./board";
import type { BoardDefinition } from "./definition";
import {
  getPieceById,
  getTrackOccupant,
} from "./occupancy";
import type { BackwardMove, ForwardMove } from "./moves";
import type { Piece, PlayerId, TrackPosition } from "./types";

export type EntryMove = {
  kind: "enter";
  pieceId: string;
  destination: TrackPosition;
  capturedPieceId?: string;
};

export type PieceMove = EntryMove | ForwardMove | BackwardMove;

export type SwapMove = {
  kind: "swap";
  pieceId: string;
  targetPieceId: string;
  destination: TrackPosition;
  targetDestination: TrackPosition;
};

export type AtomicMove = PieceMove | SwapMove;

export function getLegalEntryMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  board?: BoardDefinition,
): EntryMove[] {
  const entryIndex = getEntryIndex(playerId, board);
  const occupant = getTrackOccupant(pieces, entryIndex);

  return pieces
    .filter(
      (piece) => piece.owner === playerId && piece.position.zone === "reserve",
    )
    .map((piece) => ({
      kind: "enter",
      pieceId: piece.id,
      destination: {
        zone: "track",
        index: entryIndex,
        isEntryProtected: true,
      },
      ...(occupant ? { capturedPieceId: occupant.id } : {}),
    }));
}

export function applyPieceMove(
  pieces: readonly Piece[],
  move: PieceMove,
): Piece[] {
  const movingPiece = getPieceById(pieces, move.pieceId);

  if (!movingPiece) {
    throw new Error(`Unknown moving piece: ${move.pieceId}`);
  }

  if (
    move.capturedPieceId !== undefined &&
    !getPieceById(pieces, move.capturedPieceId)
  ) {
    throw new Error(`Unknown captured piece: ${move.capturedPieceId}`);
  }

  return pieces.map((piece) => {
    if (piece.id === move.pieceId) {
      return {
        ...piece,
        position: move.destination,
      };
    }

    if (piece.id === move.capturedPieceId) {
      return {
        ...piece,
        position: { zone: "reserve" },
      };
    }

    return piece;
  });
}

export function applyAtomicMove(
  pieces: readonly Piece[],
  move: AtomicMove,
): Piece[] {
  if (move.kind !== "swap") {
    return applyPieceMove(pieces, move);
  }

  const piece = getPieceById(pieces, move.pieceId);
  const target = getPieceById(pieces, move.targetPieceId);

  if (!piece) {
    throw new Error(`Unknown moving piece: ${move.pieceId}`);
  }

  if (!target) {
    throw new Error(`Unknown swap target: ${move.targetPieceId}`);
  }

  return pieces.map((currentPiece) => {
    if (currentPiece.id === move.pieceId) {
      return { ...currentPiece, position: move.destination };
    }

    if (currentPiece.id === move.targetPieceId) {
      return { ...currentPiece, position: move.targetDestination };
    }

    return currentPiece;
  });
}
