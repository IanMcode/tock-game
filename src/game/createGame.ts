import { createStandardDeck, shuffleDeck } from "./cards";
import { getEntryIndex } from "./board";
import { dealHand, FOUR_PLAYER_DEAL_SCHEDULE } from "./deals";
import { getNextPlayer } from "./rules";
import { PLAYER_IDS, type GameState, type Piece, type Player } from "./types";

const PIECES_PER_PLAYER = 4;
export type CreateGameOptions = {
  shuffle?: boolean;
  dealer?: Player["id"];
  startWithPieceOnEntry?: boolean;
};

function createPiecesForPlayer(
  owner: Player["id"],
  startWithPieceOnEntry: boolean,
): Piece[] {
  return Array.from({ length: PIECES_PER_PLAYER }, (_, index) => ({
    id: `${owner}-${index + 1}`,
    owner,
    position: index === 0 && startWithPieceOnEntry
      ? {
          zone: "track" as const,
          index: getEntryIndex(owner),
          isEntryProtected: true,
        }
      : { zone: "reserve" as const },
  }));
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const shouldShuffle = options.shuffle ?? true;
  const startWithPieceOnEntry = options.startWithPieceOnEntry ?? true;
  const deck = shouldShuffle ? shuffleDeck(createStandardDeck()) : createStandardDeck();
  const dealer =
    options.dealer ?? PLAYER_IDS[Math.floor(Math.random() * PLAYER_IDS.length)];
  const players: Player[] = PLAYER_IDS.map((id) => ({
    id,
    hand: [],
    pieces: createPiecesForPlayer(id, startWithPieceOnEntry),
  }));
  const dealt = dealHand(players, deck, FOUR_PLAYER_DEAL_SCHEDULE[0]);

  return {
    ...dealt,
    currentPlayer: getNextPlayer(dealer),
    discardPile: [],
    forcedDiscardPlayer: null,
    winningTeam: null,
    dealer,
    dealIndex: 0,
    phase: "exchange",
    exchangeSelections: {},
  };
}
