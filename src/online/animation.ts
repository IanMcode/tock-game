import type { AtomicMove } from "../game/actions";
import type { PublicGameEvent } from "../game/view";

export function getUnseenAnimationMoves(
  events: readonly PublicGameEvent[],
  afterRevision: number,
  throughRevision: number,
): AtomicMove[] {
  return events
    .filter((event) => event.revision > afterRevision && event.revision <= throughRevision)
    .flatMap((event) => {
      if (event.type !== "play" || !event.move) return [];
      return event.move.kind === "split7" ? event.move.steps : [event.move];
    });
}
