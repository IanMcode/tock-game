import { createStandardDeck, shuffleDeck } from "./cards";
import { dealHand, FOUR_PLAYER_DEAL_SCHEDULE } from "./deals";
import { getNextPlayer } from "./rules";
import { PLAYER_IDS, type GameState, type Piece, type Player } from "./types";

const PIECES_PER_PLAYER = 4;
type CreateGameOptions = {
  shuffle?: boolean;
  dealer?: Player["id"];
};

function createPiecesForPlayer(owner: Player["id"]): Piece[] {
  return Array.from({ length: PIECES_PER_PLAYER }, (_, index) => ({
    id: `${owner}-${index + 1}`,
    owner,
    position: { zone: "reserve" },
  }));
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const shouldShuffle = options.shuffle ?? true;
  const deck = shouldShuffle ? shuffleDeck(createStandardDeck()) : createStandardDeck();
  const dealer =
    options.dealer ?? PLAYER_IDS[Math.floor(Math.random() * PLAYER_IDS.length)];
  const players: Player[] = PLAYER_IDS.map((id) => ({
    id,
    hand: [],
    pieces: createPiecesForPlayer(id),
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
