import {
  createRandomState,
  createStandardDeck,
  nextSeededRandom,
  shuffleDeckWithState,
} from "./cards";
import { getEntryIndex } from "./board";
import { dealHand, FOUR_PLAYER_DEAL_SCHEDULE } from "./deals";
import { getNextPlayer } from "./rules";
import { PLAYER_IDS, type GameState, type Piece, type Player } from "./types";

const PIECES_PER_PLAYER = 4;
export type CreateGameOptions = {
  shuffle?: boolean;
  dealer?: Player["id"];
  startWithPieceOnEntry?: boolean;
  randomState?: number;
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
  let randomState = options.randomState ?? createRandomState();
  const shuffled = shouldShuffle
    ? shuffleDeckWithState(createStandardDeck(), randomState)
    : { cards: createStandardDeck(), state: randomState };
  randomState = shuffled.state;
  let dealer = options.dealer;
  if (!dealer) {
    const randomDealer = nextSeededRandom(randomState);
    randomState = randomDealer.state;
    dealer = PLAYER_IDS[Math.floor(randomDealer.value * PLAYER_IDS.length)];
  }
  const players: Player[] = PLAYER_IDS.map((id) => ({
    id,
    hand: [],
    pieces: createPiecesForPlayer(id, startWithPieceOnEntry),
  }));
  const dealt = dealHand(players, shuffled.cards, FOUR_PLAYER_DEAL_SCHEDULE[0]);

  return {
    ...dealt,
    rulesetId: "classic-partners-4",
    randomState,
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
