import type { AtomicMove } from "../game/actions";
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
