import type { GameSession, MovedPieceDetail, PiecePositionBefore } from "./session";
import type { CardMove } from "./turns";
import type {
  Card,
  GameState,
  Piece,
  PlayerId,
} from "./types";

export type PlayerPublicView = {
  id: PlayerId;
  handCount: number;
  hand?: Card[];
  pieces: Piece[];
};

export type GamePublicView = Pick<
  GameState,
  | "rulesetId"
  | "currentPlayer"
  | "discardPile"
  | "forcedDiscardPlayer"
  | "winningTeam"
  | "dealer"
  | "dealIndex"
  | "phase"
  | "charityTurns"
  | "charityCounts"
  | "charityRequestQueue"
  | "charityRequestIndex"
  | "lastCharityTransfer"
> & {
  players: PlayerPublicView[];
  drawPileCount: number;
  exchangeSelections: Partial<Record<PlayerId, true>>;
  charityExchange: Omit<NonNullable<GameState["charityExchange"]>, "receivedCard"> | null;
};

export type GameSessionView = {
  id: string;
  revision: number;
  viewer: PlayerId | null;
  game: GamePublicView;
  events: PublicGameEvent[];
};

export type PublicGameEvent = {
  revision: number;
  actor: PlayerId;
  type: "exchange" | "play" | "discard" | "charity-request" | "charity-return";
  card: Card | null;
  move?: CardMove;
  movedPieces?: MovedPieceDetail[];
  piecePositionsBefore?: PiecePositionBefore[];
  startsNewDealerRound?: boolean;
  charityRank?: import("./types").CardRank;
  charityDonor?: PlayerId | null;
};

export function createSessionView(
  session: GameSession,
  viewer: PlayerId | null,
): GameSessionView {
  if (viewer && !session.game.players.some((player) => player.id === viewer)) {
    throw new Error(`Unknown session viewer ${viewer}.`);
  }

  const game = session.game;
  return {
    id: session.id,
    revision: session.revision,
    viewer,
    events: session.events.map((event) => {
      if (event.command.type === "select-exchange-card") {
        return {
          revision: event.revision,
          actor: event.command.actor,
          type: "exchange" as const,
          card: null,
        };
      }
      if (event.command.type === "play-card") {
        return {
          revision: event.revision,
          actor: event.command.actor,
          type: "play" as const,
          card: event.card ?? null,
          move: cloneCardMove(event.command.move),
          ...(event.movedPieces ? { movedPieces: event.movedPieces.map((detail) => ({ ...detail })) } : {}),
          ...(event.piecePositionsBefore ? {
            piecePositionsBefore: event.piecePositionsBefore.map((detail) => ({
              pieceId: detail.pieceId,
              position: { ...detail.position },
            })),
          } : {}),
          ...(event.startsNewDealerRound ? { startsNewDealerRound: true } : {}),
        };
      }
      if (event.command.type === "request-charity-card") {
        return {
          revision: event.revision,
          actor: event.command.actor,
          type: "charity-request" as const,
          card: null,
          charityRank: event.command.rank,
          charityDonor: event.charityDonor ?? null,
        };
      }
      if (event.command.type === "return-charity-card") {
        return {
          revision: event.revision,
          actor: event.command.actor,
          type: "charity-return" as const,
          card: null,
        };
      }
      return {
        revision: event.revision,
        actor: event.command.actor,
        type: "discard" as const,
        card: event.card ?? null,
      };
    }),
    game: {
      rulesetId: game.rulesetId,
      players: game.players.map((player) => ({
        id: player.id,
        handCount: player.hand.length,
        ...(player.id === viewer ? { hand: [...player.hand] } : {}),
        pieces: player.pieces.map((piece) => ({
          ...piece,
          position: { ...piece.position },
        })),
      })),
      currentPlayer: game.currentPlayer,
      drawPileCount: game.drawPile.length,
      discardPile: [...game.discardPile],
      forcedDiscardPlayer: game.forcedDiscardPlayer,
      winningTeam: game.winningTeam ? [...game.winningTeam] : null,
      dealer: game.dealer,
      dealIndex: game.dealIndex,
      phase: game.phase,
      exchangeSelections: Object.fromEntries(
        Object.keys(game.exchangeSelections).map((playerId) => [playerId, true]),
      ),
      charityTurns: game.charityTurns,
      charityCounts: { ...game.charityCounts },
      charityRequestQueue: [...game.charityRequestQueue],
      charityRequestIndex: game.charityRequestIndex,
      charityExchange: game.charityExchange ? {
        requester: game.charityExchange.requester,
        donor: game.charityExchange.donor,
        requestedRank: game.charityExchange.requestedRank,
      } : null,
      lastCharityTransfer: game.lastCharityTransfer ? { ...game.lastCharityTransfer } : null,
    },
  };
}

function cloneCardMove(move: CardMove): CardMove {
  return JSON.parse(JSON.stringify(move)) as CardMove;
}
