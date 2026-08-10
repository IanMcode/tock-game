import { shuffleDeckWithState } from "./cards";
import { getNextPlayer } from "./rules";
import { getPartner } from "./teams";
import { PLAYER_IDS, type GameState, type Player, type PlayerId } from "./types";

export const FOUR_PLAYER_DEAL_SCHEDULE = [5, 4, 4] as const;

export function dealHand(
  players: readonly Player[],
  drawPile: readonly GameState["drawPile"][number][],
  cardsPerPlayer: number,
): Pick<GameState, "players" | "drawPile"> {
  const cardsNeeded = players.length * cardsPerPlayer;

  if (drawPile.length < cardsNeeded) {
    throw new Error("The draw pile does not contain enough cards for the deal.");
  }

  let offset = 0;
  const dealtPlayers = players.map((player) => {
    const hand = drawPile.slice(offset, offset + cardsPerPlayer);
    offset += cardsPerPlayer;

    return { ...player, hand };
  });

  return {
    players: dealtPlayers,
    drawPile: drawPile.slice(cardsNeeded),
  };
}

export function selectExchangeCard(
  game: GameState,
  playerId: PlayerId,
  cardIndex: number,
): GameState {
  if (game.phase !== "exchange") {
    throw new Error("Cards can only be selected during the exchange phase.");
  }

  const player = game.players.find(({ id }) => id === playerId);

  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  if (game.exchangeSelections[playerId] !== undefined) {
    throw new Error(`${playerId} has already chosen a card for this exchange.`);
  }

  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= player.hand.length) {
    throw new RangeError("Exchange card index is outside the player's hand.");
  }

  const exchangeSelections = {
    ...game.exchangeSelections,
    [playerId]: cardIndex,
  };

  if (!PLAYER_IDS.every((id) => exchangeSelections[id] !== undefined)) {
    return { ...game, exchangeSelections };
  }

  const exchangedPlayers = game.players.map((currentPlayer) => {
    const ownIndex = exchangeSelections[currentPlayer.id];
    const partner = game.players.find(
      ({ id }) => id === getPartner(currentPlayer.id),
    );
    const partnerIndex = partner
      ? exchangeSelections[partner.id]
      : undefined;

    if (ownIndex === undefined || !partner || partnerIndex === undefined) {
      throw new Error("The partner exchange is incomplete.");
    }

    const receivedCard = partner.hand[partnerIndex];

    return {
      ...currentPlayer,
      hand: currentPlayer.hand.map((card, index) =>
        index === ownIndex ? receivedCard : card,
      ),
    };
  });

  return {
    ...game,
    players: exchangedPlayers,
    phase: "play",
    exchangeSelections: {},
  };
}

export function advanceDealIfHandComplete(game: GameState): GameState {
  if (
    game.winningTeam ||
    game.phase !== "play" ||
    game.players.some((player) => player.hand.length > 0)
  ) {
    return game;
  }

  if (game.dealIndex < FOUR_PLAYER_DEAL_SCHEDULE.length - 1) {
    const dealIndex = (game.dealIndex + 1) as 1 | 2;
    const dealt = dealHand(
      game.players,
      game.drawPile,
      FOUR_PLAYER_DEAL_SCHEDULE[dealIndex],
    );

    return startExchange({ ...game, ...dealt, dealIndex });
  }

  const dealer = getNextPlayer(game.dealer);
  const shuffled = shuffleDeckWithState(game.discardPile, game.randomState);
  const dealt = dealHand(
    game.players,
    shuffled.cards,
    FOUR_PLAYER_DEAL_SCHEDULE[0],
  );

  return startExchange({
    ...game,
    ...dealt,
    dealer,
    dealIndex: 0,
    discardPile: [],
    randomState: shuffled.state,
  });
}

function startExchange(game: GameState): GameState {
  return {
    ...game,
    currentPlayer: getNextPlayer(game.dealer),
    phase: "exchange",
    exchangeSelections: {},
    forcedDiscardPlayer: null,
  };
}
