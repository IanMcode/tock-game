import type { Piece, PlayerId } from "./types";

const PARTNERS: Record<PlayerId, PlayerId> = {
  P1: "P3",
  P2: "P4",
  P3: "P1",
  P4: "P2",
};

export function getPartner(playerId: PlayerId): PlayerId {
  return PARTNERS[playerId];
}

export function areAllPiecesHome(
  pieces: readonly Piece[],
  playerId: PlayerId,
): boolean {
  const playerPieces = pieces.filter((piece) => piece.owner === playerId);

  return (
    playerPieces.length === 4 &&
    playerPieces.every((piece) => piece.position.zone === "home")
  );
}

export function getControlledPlayer(
  pieces: readonly Piece[],
  playerId: PlayerId,
): PlayerId {
  return areAllPiecesHome(pieces, playerId) ? getPartner(playerId) : playerId;
}

export function getWinningTeam(
  pieces: readonly Piece[],
): readonly [PlayerId, PlayerId] | null {
  const teams = [
    ["P1", "P3"],
    ["P2", "P4"],
  ] as const;

  return (
    teams.find(([first, second]) =>
      [first, second].every((playerId) => areAllPiecesHome(pieces, playerId)),
    ) ?? null
  );
}
