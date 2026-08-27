import { shuffleDeckWithState } from "./cards";
import { CLASSIC_PARTNERS_RULESET } from "./definition";
import { getRulesetDefinition } from "./definition";
import { getNextPlayer } from "./rules";
import { getPartner } from "./teams";
import type { GameState, Player, PlayerId } from "./types";

export const FOUR_PLAYER_DEAL_SCHEDULE = CLASSIC_PARTNERS_RULESET.dealSchedule;

export type NextHandPreview = {
  cardsPerPlayer: number;
  handsRemainingInDeal: number;
  starter: PlayerId;
};

export function getNextHandPreview(game: Pick<GameState, "rulesetId" | "dealer" | "dealIndex"> & {
  players: readonly Pick<Player, "id">[];
}): NextHandPreview {
  const ruleset = getRulesetDefinition(game.rulesetId);
  const schedule = ruleset.dealSchedule;
  const startsNewDeal = game.dealIndex >= schedule.length - 1;
  const nextHandIndex = startsNewDeal ? 0 : game.dealIndex + 1;
  const playerIds = game.players.map((player) => player.id);
  const nextDealer = startsNewDeal ? getNextPlayer(game.dealer, playerIds) : game.dealer;

  return {
    cardsPerPlayer: schedule[nextHandIndex],
    handsRemainingInDeal: Math.max(0, schedule.length - game.dealIndex - 1),
    starter: getNextPlayer(nextDealer, playerIds),
  };
}

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
  const ruleset = getRulesetDefinition(game.rulesetId);
  if (ruleset.exchange !== "partners") {
    throw new Error("This ruleset does not exchange cards.");
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

  if (!game.players.every(({ id }) => exchangeSelections[id] !== undefined)) {
    return { ...game, exchangeSelections };
  }

  const exchangedPlayers = game.players.map((currentPlayer) => {
    const ownIndex = exchangeSelections[currentPlayer.id];
    const partner = game.players.find(
      ({ id }) => id === getPartner(currentPlayer.id, game.rulesetId),
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

  const ruleset = getRulesetDefinition(game.rulesetId);
  const schedule = ruleset.dealSchedule;
  if (game.dealIndex < schedule.length - 1) {
    const dealIndex = game.dealIndex + 1;
    const dealt = dealHand(
      game.players,
      game.drawPile,
      schedule[dealIndex],
    );

    return startHand({ ...game, ...dealt, dealIndex });
  }

  const playerIds = game.players.map((player) => player.id);
  const dealer = getNextPlayer(game.dealer, playerIds);
  const shuffled = shuffleDeckWithState(
    [...game.drawPile, ...game.discardPile],
    game.randomState,
  );
  const dealt = dealHand(
    game.players,
    shuffled.cards,
    schedule[0],
  );

  return startHand({
    ...game,
    ...dealt,
    dealer,
    dealIndex: 0,
    discardPile: [],
    randomState: shuffled.state,
  });
}

function startHand(game: GameState): GameState {
  const ruleset = getRulesetDefinition(game.rulesetId);
  return {
    ...game,
    currentPlayer: getNextPlayer(game.dealer, game.players.map((player) => player.id)),
    phase: ruleset.exchange === "partners" ? "exchange" : "play",
    exchangeSelections: {},
    forcedDiscardPlayer: null,
    charityExchange: null,
  };
}
