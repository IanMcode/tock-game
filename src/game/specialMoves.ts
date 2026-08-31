import { applyPieceMove, type SwapMove } from "./actions";
import { getLegalForwardMoves, type ForwardMove } from "./moves";
import type { BoardDefinition } from "./definition";
import type { Piece, PlayerId, TrackPosition } from "./types";

export type SplitSevenMove = {
  kind: "split7";
  steps: ForwardMove[];
};

export function getLegalJackMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
): SwapMove[] {
  const trackPieces = pieces.filter(
    (piece): piece is Piece & { position: TrackPosition } =>
      piece.position.zone === "track",
  );
  const ownTrackPieces = trackPieces.filter((piece) => piece.owner === playerId);
  const seenPairs = new Set<string>();
  const moves: SwapMove[] = [];

  for (const piece of ownTrackPieces) {
    for (const target of trackPieces) {
      if (piece.id === target.id) {
        continue;
      }

      if (target.position.isEntryProtected && target.owner !== playerId) {
        continue;
      }

      const pairKey = [piece.id, target.id].sort().join(":");

      if (seenPairs.has(pairKey)) {
        continue;
      }

      seenPairs.add(pairKey);
      moves.push({
        kind: "swap",
        pieceId: piece.id,
        targetPieceId: target.id,
        destination: {
          zone: "track",
          index: target.position.index,
          isEntryProtected: false,
        },
        targetDestination: {
          zone: "track",
          index: piece.position.index,
          isEntryProtected: false,
        },
      });
    }
  }

  return moves;
}

export function getLegalSplitSevenMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  board?: BoardDefinition,
  eliminatePassedPieces = true,
): SplitSevenMove[] {
  const moves = buildSplitSevenMoves(pieces, playerId, 7, [], board);
  if (eliminatePassedPieces) return moves;
  return uniqueSplitMoves(moves.flatMap((move) => {
    const normalized = normalizeLandingOnlyCaptures(pieces, move);
    return hasUniqueFinalPositions(applySplitSevenMove(pieces, normalized)) ? [normalized] : [];
  }));
}

function normalizeLandingOnlyCaptures(
  startingPieces: readonly Piece[],
  move: SplitSevenMove,
): SplitSevenMove {
  const lastStepByPiece = new Map<string, number>();
  move.steps.forEach((step, index) => lastStepByPiece.set(step.pieceId, index));
  let pieces = [...startingPieces];
  const steps = move.steps.map((step, index) => {
    const withoutCapture: ForwardMove = {
      kind: "forward",
      pieceId: step.pieceId,
      route: step.route,
      destination: step.destination,
    };
    const isFinalStepForPiece = lastStepByPiece.get(step.pieceId) === index;
    const destinationIndex = step.destination.zone === "track" ? step.destination.index : null;
    const occupant = isFinalStepForPiece && destinationIndex !== null
      ? pieces.find((piece) =>
          piece.id !== step.pieceId &&
          piece.position.zone === "track" &&
          piece.position.index === destinationIndex)
      : undefined;
    const normalized: ForwardMove = occupant
      ? { ...withoutCapture, capturedPieceId: occupant.id }
      : withoutCapture;
    pieces = applyPieceMove(pieces, normalized);
    return normalized;
  });
  return { kind: "split7", steps };
}

function hasUniqueFinalPositions(pieces: readonly Piece[]): boolean {
  const occupied = pieces
    .filter((piece) => piece.position.zone !== "reserve")
    .map((piece) => {
      if (piece.position.zone === "track") return `track:${piece.position.index}`;
      if (piece.position.zone === "home") return `home:${piece.owner}:${piece.position.index}`;
      return `reserve:${piece.id}`;
    });
  return new Set(occupied).size === occupied.length;
}

function uniqueSplitMoves(moves: readonly SplitSevenMove[]): SplitSevenMove[] {
  const seen = new Set<string>();
  return moves.filter((move) => {
    const key = JSON.stringify(move);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSplitSevenMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  stepsRemaining: number,
  steps: readonly ForwardMove[],
  board?: BoardDefinition,
): SplitSevenMove[] {
  if (stepsRemaining === 0) {
    return [{ kind: "split7", steps: [...steps] }];
  }

  const nextSteps = pieces
    .filter((piece) => piece.owner === playerId)
    .flatMap((piece) => getLegalForwardMoves(pieces, piece.id, 1, board));

  return nextSteps.flatMap((step) =>
    buildSplitSevenMoves(
      applyPieceMove(pieces, step),
      playerId,
      stepsRemaining - 1,
      [...steps, step],
      board,
    ),
  );
}

export function applySplitSevenMove(
  pieces: readonly Piece[],
  move: SplitSevenMove,
): Piece[] {
  if (move.steps.length !== 7) {
    throw new Error("A split 7 must contain exactly seven steps.");
  }

  return move.steps.reduce<Piece[]>(
    (currentPieces, step) => applyPieceMove(currentPieces, step),
    [...pieces],
  );
}
