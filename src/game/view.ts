import type { GameSession } from "./session";
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
> & {
  players: PlayerPublicView[];
  drawPileCount: number;
  exchangeSelections: Partial<Record<PlayerId, true>>;
};

export type GameSessionView = {
  id: string;
  revision: number;
  viewer: PlayerId | null;
  game: GamePublicView;
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
      winningTeam: game.winningTeam
        ? [game.winningTeam[0], game.winningTeam[1]]
        : null,
      dealer: game.dealer,
      dealIndex: game.dealIndex,
      phase: game.phase,
      exchangeSelections: Object.fromEntries(
        Object.keys(game.exchangeSelections).map((playerId) => [playerId, true]),
      ),
    },
  };
}
