import { createStandardDeck, shuffleDeck } from "./cards";
import { PLAYER_IDS, type GameState, type Piece, type Player } from "./types";

const PIECES_PER_PLAYER = 4;
const CARDS_PER_PLAYER = 5;

type CreateGameOptions = {
  shuffle?: boolean;
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
  const players: Player[] = PLAYER_IDS.map((id) => ({
    id,
    hand: deck.splice(0, CARDS_PER_PLAYER),
    pieces: createPiecesForPlayer(id),
  }));

  return {
    players,
    currentPlayer: "P1",
    drawPile: deck,
    discardPile: [],
    forcedDiscardPlayer: null,
    winningTeam: null,
  };
}
