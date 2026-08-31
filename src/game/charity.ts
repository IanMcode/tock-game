import { getLegalBasicCardMoves } from "./cardMoves";
import { getRulesetDefinition } from "./definition";
import { getAllPieces } from "./occupancy";
import { getNextPlayer } from "./rules";
import type { CardMove } from "./turns";
import type { CardRank, GameState, PlayerId } from "./types";

export function isCharityRequestRequired(game: GameState): boolean {
  return game.phase === "charity" &&
    !game.charityExchange &&
    game.charityRequestQueue[game.charityRequestIndex] === game.currentPlayer;
}

export function isCharityQualifyingTurn(game: GameState): boolean {
  if (game.charityTurns === 0) return false;
  const player = game.players.find((candidate) => candidate.id === game.currentPlayer);
  if (!player) return false;
  const pieces = getAllPieces(game);
  const canMakeQualifyingMove = player.hand.some((card) =>
    getLegalBasicCardMoves(pieces, player.id, card, game.rulesetId, game.cardRules)
      .some((move) => moveUsesQualifyingPiece(move, pieces, player.id, card.rank)));
  if (canMakeQualifyingMove) return false;

  const piecesWithoutEnemyEntryProtection = pieces.map((piece) =>
    piece.owner !== player.id && piece.position.zone === "track" && piece.position.isEntryProtected
      ? { ...piece, position: { ...piece.position, isEntryProtected: false } }
      : piece);
  const protectedEntryCanExplainBlock = player.hand.some((card) =>
    getLegalBasicCardMoves(piecesWithoutEnemyEntryProtection, player.id, card, game.rulesetId, game.cardRules)
      .some((move) => moveUsesQualifyingPiece(move, piecesWithoutEnemyEntryProtection, player.id, card.rank)));
  return !protectedEntryCanExplainBlock;
}

export function updateCharityEligibilityAfterTurn(game: GameState): GameState["charityHandEligible"] {
  if (game.charityTurns === 0) return game.charityHandEligible;
  return {
    ...game.charityHandEligible,
    [game.currentPlayer]: (game.charityHandEligible[game.currentPlayer] ?? true) && isCharityQualifyingTurn(game),
  };
}

export function settleCharityCountsAfterHand(game: GameState): GameState["charityCounts"] {
  if (game.charityTurns === 0) return {};
  return Object.fromEntries(game.players.map((player) => {
    const current = game.charityCounts[player.id] ?? 0;
    const next = (game.charityHandEligible[player.id] ?? true)
      ? Math.min(game.charityTurns, current + 1)
      : 0;
    return [player.id, next];
  }));
}

export function beginCharityRequests(
  game: GameState,
  starter: PlayerId,
  nextPhase: "exchange" | "play",
): GameState {
  const playerIds = game.players.map((player) => player.id);
  const starterIndex = playerIds.indexOf(starter);
  const clockwiseOrder = [...playerIds.slice(starterIndex), ...playerIds.slice(0, starterIndex)];
  const queue = game.charityTurns === 0
    ? []
    : clockwiseOrder.filter((playerId) => (game.charityCounts[playerId] ?? 0) >= game.charityTurns);

  return {
    ...game,
    currentPlayer: queue[0] ?? starter,
    phase: queue.length > 0 ? "charity" : nextPhase,
    charityHandEligible: Object.fromEntries(playerIds.map((playerId) => [playerId, true])),
    charityRequestQueue: queue,
    charityRequestIndex: 0,
    charityExchange: null,
  };
}

export function requestCharityCard(game: GameState, actor: PlayerId, requestedRank: CardRank): GameState {
  if (actor !== game.currentPlayer || !isCharityRequestRequired(game)) {
    throw new Error("The current player is not eligible to request a charity card.");
  }
  const playerIds = game.players.map((player) => player.id);
  let donorId = getNextPlayer(actor, playerIds);
  let donor = game.players.find((player) => player.id === donorId);
  while (
    donorId !== actor &&
    (isProtectedFromCharityRequest(game, donorId) || !donor?.hand.some((card) => card.rank === requestedRank))
  ) {
    donorId = getNextPlayer(donorId, playerIds);
    donor = game.players.find((player) => player.id === donorId);
  }

  if (!donor || donorId === actor) {
    return completeCharityRequest({ ...game, lastCharityTransfer: null }, actor);
  }

  const donorCardIndex = donor.hand.findIndex((card) => card.rank === requestedRank);
  const receivedCard = donor.hand[donorCardIndex];
  return {
    ...game,
    players: game.players.map((player) => {
      if (player.id === donorId) return { ...player, hand: player.hand.filter((_, index) => index !== donorCardIndex) };
      if (player.id === actor) return { ...player, hand: [...player.hand, receivedCard] };
      return player;
    }),
    charityExchange: { requester: actor, donor: donorId, requestedRank, receivedCard },
    lastCharityTransfer: { requester: actor, donor: donorId, requestedRank },
  };
}

export function returnCharityCard(game: GameState, actor: PlayerId, cardIndex: number): GameState {
  const exchange = game.charityExchange;
  if (!exchange || exchange.requester !== actor || actor !== game.currentPlayer || game.phase !== "charity") {
    throw new Error("There is no charity card exchange to complete.");
  }
  const requester = game.players.find((player) => player.id === actor);
  if (!requester || !Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= requester.hand.length) {
    throw new Error("Choose a valid card to return.");
  }
  if (cardIndex === requester.hand.length - 1) {
    throw new Error("Choose one of your original cards to return.");
  }
  const returnedCard = requester.hand[cardIndex];
  return completeCharityRequest({
    ...game,
    players: game.players.map((player) => {
      if (player.id === actor) return { ...player, hand: player.hand.filter((_, index) => index !== cardIndex) };
      if (player.id === exchange.donor) return { ...player, hand: [...player.hand, returnedCard] };
      return player;
    }),
    charityExchange: null,
  }, actor);
}

function completeCharityRequest(game: GameState, actor: PlayerId): GameState {
  const nextRequestIndex = game.charityRequestIndex + 1;
  const nextRequester = game.charityRequestQueue[nextRequestIndex];
  const charityCounts = {
    ...game.charityCounts,
    [actor]: game.charityRepeatAtThreshold ? game.charityTurns : 0,
  };
  if (nextRequester) {
    return {
      ...game,
      currentPlayer: nextRequester,
      charityCounts,
      charityRequestIndex: nextRequestIndex,
      charityExchange: null,
    };
  }

  const ruleset = getRulesetDefinition(game.rulesetId);
  const playerIds = game.players.map((player) => player.id);
  return {
    ...game,
    currentPlayer: getNextPlayer(game.dealer, playerIds),
    phase: ruleset.exchange === "partners" ? "exchange" : "play",
    charityCounts,
    charityRequestQueue: [],
    charityRequestIndex: 0,
    charityExchange: null,
  };
}

function isProtectedFromCharityRequest(game: GameState, playerId: PlayerId): boolean {
  return (game.charityCounts[playerId] ?? 0) > 0 || game.charityRequestQueue.includes(playerId);
}

function moveUsesQualifyingPiece(
  move: CardMove,
  pieces: ReturnType<typeof getAllPieces>,
  playerId: PlayerId,
  cardRank: CardRank,
): boolean {
  const pieceIds = move.kind === "split7" ? move.steps.map((step) => step.pieceId) : [move.pieceId];
  return pieceIds.some((pieceId) => {
    const piece = pieces.find((candidate) => candidate.id === pieceId);
    return Boolean(piece && piece.position.zone !== "home" && (cardRank !== "5" || piece.owner === playerId));
  });
}
