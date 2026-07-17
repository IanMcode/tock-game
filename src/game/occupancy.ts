import type { GameState, Piece, PlayerId } from "./types";

export function getAllPieces(game: GameState): Piece[] {
  return game.players.flatMap((player) => player.pieces);
}

export function getPieceById(
  pieces: readonly Piece[],
  pieceId: string,
): Piece | undefined {
  return pieces.find((piece) => piece.id === pieceId);
}

export function getTrackOccupant(
  pieces: readonly Piece[],
  index: number,
  excludedPieceId?: string,
): Piece | undefined {
  return pieces.find(
    (piece) =>
      piece.id !== excludedPieceId &&
      piece.position.zone === "track" &&
      piece.position.index === index,
  );
}

export function getHomeOccupant(
  pieces: readonly Piece[],
  owner: PlayerId,
  index: number,
  excludedPieceId?: string,
): Piece | undefined {
  return pieces.find(
    (piece) =>
      piece.id !== excludedPieceId &&
      piece.owner === owner &&
      piece.position.zone === "home" &&
      piece.position.index === index,
  );
}

export function isProtectedEntryPiece(piece: Piece | undefined): boolean {
  return piece?.position.zone === "track" && piece.position.isEntryProtected;
}
