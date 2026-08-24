import type { AtomicMove } from "../game/actions";
import type { Piece } from "../game/types";
import type { PublicGameEvent } from "../game/view";

export type OnlineAnimationTurn = {
  revision: number;
  event: PublicGameEvent;
  moves: AtomicMove[];
};

export function getUnseenAnimationTurns(
  events: readonly PublicGameEvent[],
  afterRevision: number,
  throughRevision: number,
): OnlineAnimationTurn[] {
  return events
    .filter((event) => event.revision > afterRevision && event.revision <= throughRevision && event.card)
    .map((event) => ({
      revision: event.revision,
      event,
      moves: event.type !== "play" || !event.move
        ? []
        : event.move.kind === "split7" ? event.move.steps : [event.move],
    }));
}

export function getUnseenAnimationMoves(
  events: readonly PublicGameEvent[],
  afterRevision: number,
  throughRevision: number,
): AtomicMove[] {
  return getUnseenAnimationTurns(events, afterRevision, throughRevision)
    .flatMap((turn) => turn.moves);
}

export function getLatestAnimationTurn(
  events: readonly PublicGameEvent[],
): OnlineAnimationTurn | null {
  const event = events.findLast((candidate) => Boolean(candidate.card));
  if (!event) return null;
  return getUnseenAnimationTurns(events, event.revision - 1, event.revision)[0] ?? null;
}

export function getCurrentDealerRoundEvents(
  events: readonly PublicGameEvent[],
): PublicGameEvent[] {
  const reshuffleIndex = events.findLastIndex((event) => event.startsNewDealerRound === true);
  return events.slice(reshuffleIndex + 1);
}

export function getReplayStartingPieces(
  pieces: readonly Piece[],
  event: PublicGameEvent,
): Piece[] | null {
  if (event.type !== "play" || !event.move) {
    return pieces.map(clonePiece);
  }
  if (!event.piecePositionsBefore?.length) return null;

  const positions = new Map(event.piecePositionsBefore.map((detail) => [detail.pieceId, detail.position]));
  return pieces.map((piece) => {
    const position = positions.get(piece.id);
    return position ? { ...piece, position: { ...position } } : clonePiece(piece);
  });
}

function clonePiece(piece: Piece): Piece {
  return { ...piece, position: { ...piece.position } };
}
