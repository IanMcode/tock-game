export const PLAYER_IDS = ["P1", "P2", "P3", "P4"] as const;

export type PlayerId = (typeof PLAYER_IDS)[number];

export type CardSuit = "clubs" | "diamonds" | "hearts" | "spades";

export type CardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type Card = {
  rank: CardRank;
  suit: CardSuit;
};

export type CardMoveValue = number | "start" | "swap" | "split7";

export type PiecePosition = "start";

export type Piece = {
  id: string;
  owner: PlayerId;
  position: PiecePosition;
};

export type Player = {
  id: PlayerId;
  hand: Card[];
  pieces: Piece[];
};

export type GameState = {
  players: Player[];
  currentPlayer: PlayerId;
  drawPile: Card[];
  discardPile: Card[];
};
