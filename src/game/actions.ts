import { getEntryIndex } from "./board";
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

export function getLegalEntryMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
): EntryMove[] {
  const entryIndex = getEntryIndex(playerId);
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
