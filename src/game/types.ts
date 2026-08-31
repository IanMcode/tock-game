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

export type CharityTurns = 0 | 1 | 2 | 3;

export type AceRule = "one-or-eleven" | "one-only";
export type KingRule = "land-only" | "eliminate-passed";
export type JackRule = "swap-only" | "swap-or-eleven";
export type SevenRule = "land-only" | "eliminate-passed";

export type CardRuleVariants = {
  ace: AceRule;
  king: KingRule;
  jack: JackRule;
  seven: SevenRule;
};

export const DEFAULT_CARD_RULE_VARIANTS: CardRuleVariants = {
  ace: "one-or-eleven",
  king: "land-only",
  jack: "swap-only",
  seven: "eliminate-passed",
};

export type CharityExchange = {
  requester: PlayerId;
  donor: PlayerId;
  requestedRank: CardRank;
  receivedCard: Card;
};

export type ReservePosition = {
  zone: "reserve";
};

export type TrackPosition = {
  zone: "track";
  index: number;
  isEntryProtected: boolean;
};

export type HomePosition = {
  zone: "home";
  index: number;
};

export type PiecePosition = ReservePosition | TrackPosition | HomePosition;

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

export type RulesetId =
  | "free-for-all-2"
  | "free-for-all-3"
  | "free-for-all-4"
  | "classic-partners-4";

export type GameState = {
  rulesetId: RulesetId;
  randomState: number;
  players: Player[];
  currentPlayer: PlayerId;
  drawPile: Card[];
  discardPile: Card[];
  forcedDiscardPlayer: PlayerId | null;
  winningTeam: readonly PlayerId[] | null;
  dealer: PlayerId;
  dealIndex: number;
  phase: "charity" | "exchange" | "play";
  exchangeSelections: Partial<Record<PlayerId, number>>;
  charityTurns: CharityTurns;
  charityRepeatAtThreshold: boolean;
  cardRules: CardRuleVariants;
  charityCounts: Partial<Record<PlayerId, number>>;
  charityHandEligible: Partial<Record<PlayerId, boolean>>;
  charityRequestQueue: PlayerId[];
  charityRequestIndex: number;
  charityExchange: CharityExchange | null;
  lastCharityTransfer: Pick<CharityExchange, "requester" | "donor" | "requestedRank"> | null;
};
