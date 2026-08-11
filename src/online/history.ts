import type { PublicGameEvent } from "../game/view";
import { DEFAULT_PLAYER_NAMES } from "./roomService";
import type { PlayerId } from "../game/types";

const SUIT_SYMBOL = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;

export function describePublicGameEvent(
  event: PublicGameEvent,
  playerNames: Partial<Record<PlayerId, string>>,
): string {
  const actor = playerNames[event.actor] ?? DEFAULT_PLAYER_NAMES[event.actor];
  const card = event.card ? `${event.card.rank}${SUIT_SYMBOL[event.card.suit]}` : "a card";
  if (event.type === "discard") return `${actor} discarded ${card}.`;
  if (!event.move) return `${actor} played ${card}.`;

  const capturedPieceIds = event.move.kind === "split7"
    ? event.move.steps.flatMap((step) => step.capturedPieceId ? [step.capturedPieceId] : [])
    : event.move.kind === "swap" || !event.move.capturedPieceId
      ? []
      : [event.move.capturedPieceId];
  const eliminated = capturedPieceIds.length > 0
    ? `, eliminating ${formatEliminatedPieces(capturedPieceIds, playerNames)} and returning ${capturedPieceIds.length === 1 ? "it" : "them"} to reserve`
    : "";

  if (event.move.kind === "split7") return `${actor} played ${card} and split seven steps${eliminated}.`;
  if (event.move.kind === "enter") return `${actor} played ${card} and entered a piece${eliminated}.`;
  if (event.move.kind === "swap") return `${actor} played ${card} and swapped two pieces.`;
  const direction = event.move.kind === "backward" ? "backward" : "forward";
  return `${actor} played ${card} and moved ${direction}${eliminated}.`;
}

function formatEliminatedPieces(
  pieceIds: readonly string[],
  playerNames: Partial<Record<PlayerId, string>>,
): string {
  return pieceIds.map((pieceId) => {
    const [owner, number] = pieceId.split("-");
    const playerId = owner as PlayerId;
    return `${playerNames[playerId] ?? DEFAULT_PLAYER_NAMES[playerId]}'s piece ${number}`;
  }).join(pieceIds.length === 2 ? " and " : ", ");
}
