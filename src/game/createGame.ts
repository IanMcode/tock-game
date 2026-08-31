import {
  createRandomState,
  createStandardDeck,
  nextSeededRandom,
  shuffleDeckWithState,
} from "./cards";
import { getEntryIndex } from "./board";
import { dealHand } from "./deals";
import {
  getRulesetDefinition,
  getRulesetForOptions,
  type BoardDefinition,
  type BoardPlayerCount,
} from "./definition";
import { getNextPlayer } from "./rules";
import type { CharityTurns, GameState, Piece, Player, RulesetId } from "./types";

export type CreateGameOptions = {
  shuffle?: boolean;
  dealer?: Player["id"];
  startWithPieceOnEntry?: boolean;
  randomState?: number;
  playerCount?: BoardPlayerCount;
  teams?: boolean;
  rulesetId?: RulesetId;
  charityTurns?: CharityTurns;
  charityRepeatAtThreshold?: boolean;
};

function createPiecesForPlayer(
  owner: Player["id"],
  startWithPieceOnEntry: boolean,
  board: BoardDefinition,
): Piece[] {
  return Array.from({ length: board.piecesPerPlayer }, (_, index) => ({
    id: `${owner}-${index + 1}`,
    owner,
    position: index === 0 && startWithPieceOnEntry
      ? {
          zone: "track" as const,
          index: getEntryIndex(owner, board),
          isEntryProtected: true,
        }
      : { zone: "reserve" as const },
  }));
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const shouldShuffle = options.shuffle ?? true;
  const startWithPieceOnEntry = options.startWithPieceOnEntry ?? true;
  const ruleset = options.rulesetId
    ? getRulesetDefinition(options.rulesetId)
    : getRulesetForOptions(options.playerCount ?? 4, options.teams ?? (options.playerCount ?? 4) === 4);
  const playerIds = ruleset.board.playerIds;
  let randomState = options.randomState ?? createRandomState();
  const shuffled = shouldShuffle
    ? shuffleDeckWithState(createStandardDeck(), randomState)
    : { cards: createStandardDeck(), state: randomState };
  randomState = shuffled.state;
  let dealer = options.dealer;
  if (!dealer) {
    const randomDealer = nextSeededRandom(randomState);
    randomState = randomDealer.state;
    dealer = playerIds[Math.floor(randomDealer.value * playerIds.length)];
  }
  if (!playerIds.includes(dealer)) {
    throw new RangeError(`${dealer} is not seated in ${ruleset.id}.`);
  }
  const players: Player[] = playerIds.map((id) => ({
    id,
    hand: [],
    pieces: createPiecesForPlayer(id, startWithPieceOnEntry, ruleset.board),
  }));
  const dealt = dealHand(players, shuffled.cards, ruleset.dealSchedule[0]);

  return {
    ...dealt,
    rulesetId: ruleset.id,
    randomState,
    currentPlayer: getNextPlayer(dealer, playerIds),
    discardPile: [],
    forcedDiscardPlayer: null,
    winningTeam: null,
    dealer,
    dealIndex: 0,
    phase: ruleset.exchange === "partners" ? "exchange" : "play",
    exchangeSelections: {},
    charityTurns: options.charityTurns ?? 0,
    charityRepeatAtThreshold: options.charityRepeatAtThreshold ?? false,
    charityCounts: {},
    charityHandEligible: Object.fromEntries(playerIds.map((playerId) => [playerId, true])),
    charityRequestQueue: [],
    charityRequestIndex: 0,
    charityExchange: null,
    lastCharityTransfer: null,
  };
}
