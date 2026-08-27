import type { PublicGameEvent } from "../game/view";
import { DEFAULT_PLAYER_NAMES } from "./roomService";
import type { CardRank, PlayerId } from "../game/types";

const SUIT_SYMBOL = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const;

export function describePublicGameEvent(
  event: PublicGameEvent,
  playerNames: Partial<Record<PlayerId, string>>,
): string {
  const actor = playerNames[event.actor] ?? DEFAULT_PLAYER_NAMES[event.actor];
  const card = event.card ? `${event.card.rank}${SUIT_SYMBOL[event.card.suit]}` : "a card";
  if (event.type === "charity-request") {
    const donor = event.charityDonor ? playerNames[event.charityDonor] ?? DEFAULT_PLAYER_NAMES[event.charityDonor] : null;
    return donor
      ? `${actor} requested a ${event.charityRank}; ${donor} supplied the card.`
      : `${actor} requested a ${event.charityRank}, but no player held one.`;
  }
  if (event.type === "charity-return") return `${actor} returned a card and completed the charity exchange.`;
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

  if (event.move.kind === "split7") {
    const pieces = (event.movedPieces ?? []).map((detail) =>
      `${formatPawn(detail.pieceId, event.actor, playerNames)} ${formatSpaces(detail.spaces)}`,
    );
    return `${actor} played ${card} and split seven spots${pieces.length ? `: ${joinList(pieces)}` : ""}${eliminated}.`;
  }
  if (event.move.kind === "enter") {
    return `${actor} played ${card} to enter ${formatPawn(event.move.pieceId, event.actor, playerNames)}${eliminated}.`;
  }
  if (event.move.kind === "swap") {
    return `${actor} played ${card} and swapped ${formatPawn(event.move.pieceId, event.actor, playerNames)} with ${formatPawn(event.move.targetPieceId, event.actor, playerNames)}.`;
  }
  const pieceMove = event.move;
  const direction = pieceMove.kind === "backward" ? "backward" : "forward";
  const spaces = event.movedPieces?.find((detail) => detail.pieceId === pieceMove.pieceId)?.spaces
    ?? getCardDistance(event.card?.rank, pieceMove.kind);
  return `${actor} played ${card} on ${formatPawn(pieceMove.pieceId, event.actor, playerNames)}, moving it ${direction}${spaces ? ` ${formatSpaces(spaces)}` : ""}${eliminated}.`;
}

function formatPawn(
  pieceId: string,
  actor: PlayerId,
  playerNames: Partial<Record<PlayerId, string>>,
): string {
  const [owner, number = ""] = pieceId.split("-");
  const playerId = owner as PlayerId;
  const possessive = playerId === actor
    ? "their"
    : `${playerNames[playerId] ?? DEFAULT_PLAYER_NAMES[playerId]}'s`;
  return `${possessive} ${ordinal(Number(number))} pawn`;
}

function ordinal(value: number): string {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function formatSpaces(spaces: number): string {
  return `${spaces} ${spaces === 1 ? "spot" : "spots"}`;
}

function joinList(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function getCardDistance(rank: CardRank | undefined, kind: "forward" | "backward"): number | null {
  if (kind === "backward") return 4;
  if (!rank || rank === "A") return null;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  const value = Number(rank);
  return Number.isFinite(value) ? value : null;
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
