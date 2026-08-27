import { getLegalBasicCardMoves } from "./cardMoves";
import { getAllPieces } from "./occupancy";
import { getNextPlayer } from "./rules";
import type { CardMove } from "./turns";
import type { CardRank, GameState, PlayerId } from "./types";

export function isCharityRequestRequired(game: GameState): boolean {
  return game.charityTurns > 0 &&
    !game.charityExchange &&
    (game.charityCounts[game.currentPlayer] ?? 0) >= game.charityTurns;
}

export function isCharityQualifyingTurn(game: GameState): boolean {
  if (game.charityTurns === 0 || game.forcedDiscardPlayer === game.currentPlayer) return false;
  const player = game.players.find((candidate) => candidate.id === game.currentPlayer);
  if (!player) return false;
  const pieces = getAllPieces(game);
  const canMoveOutsideHome = player.hand.some((card) =>
    getLegalBasicCardMoves(pieces, player.id, card, game.rulesetId)
      .some((move) => moveUsesPieceOutsideHome(move, pieces)));
  if (canMoveOutsideHome) return false;

  const piecesWithoutEnemyEntryProtection = pieces.map((piece) =>
    piece.owner !== player.id && piece.position.zone === "track" && piece.position.isEntryProtected
      ? { ...piece, position: { ...piece.position, isEntryProtected: false } }
      : piece);
  const protectedEntryCanExplainBlock = player.hand.some((card) =>
    getLegalBasicCardMoves(piecesWithoutEnemyEntryProtection, player.id, card, game.rulesetId)
      .some((move) => moveUsesPieceOutsideHome(move, piecesWithoutEnemyEntryProtection)));
  return !protectedEntryCanExplainBlock;
}

export function updateCharityAfterTurn(game: GameState): GameState["charityCounts"] {
  const current = game.charityCounts[game.currentPlayer] ?? 0;
  return {
    ...game.charityCounts,
    [game.currentPlayer]: isCharityQualifyingTurn(game)
      ? Math.min(game.charityTurns, current + 1)
      : 0,
  };
}

export function requestCharityCard(game: GameState, actor: PlayerId, requestedRank: CardRank): GameState {
  if (actor !== game.currentPlayer || !isCharityRequestRequired(game)) {
    throw new Error("The current player is not eligible to request a charity card.");
  }
  const playerIds = game.players.map((player) => player.id);
  let donorId = getNextPlayer(actor, playerIds);
  let donor = game.players.find((player) => player.id === donorId);
  while (donorId !== actor && !donor?.hand.some((card) => card.rank === requestedRank)) {
    donorId = getNextPlayer(donorId, playerIds);
    donor = game.players.find((player) => player.id === donorId);
  }

  if (!donor || donorId === actor) {
    return {
      ...game,
      charityCounts: { ...game.charityCounts, [actor]: 0 },
      lastCharityTransfer: null,
    };
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
  if (!exchange || exchange.requester !== actor || actor !== game.currentPlayer) {
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
  return {
    ...game,
    players: game.players.map((player) => {
      if (player.id === actor) return { ...player, hand: player.hand.filter((_, index) => index !== cardIndex) };
      if (player.id === exchange.donor) return { ...player, hand: [...player.hand, returnedCard] };
      return player;
    }),
    charityCounts: { ...game.charityCounts, [actor]: 0 },
    charityExchange: null,
  };
}

function moveUsesPieceOutsideHome(move: CardMove, pieces: ReturnType<typeof getAllPieces>): boolean {
  const pieceIds = move.kind === "split7" ? move.steps.map((step) => step.pieceId) : [move.pieceId];
  return pieceIds.some((pieceId) => pieces.find((piece) => piece.id === pieceId)?.position.zone !== "home");
}
