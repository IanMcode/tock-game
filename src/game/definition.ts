import { PLAYER_IDS, type PlayerId, type RulesetId } from "./types";

export const SUPPORTED_BOARD_PLAYER_COUNTS = [2, 3, 4] as const;
export type BoardPlayerCount = (typeof SUPPORTED_BOARD_PLAYER_COUNTS)[number];

export type BoardDefinition = {
  id: `tock-${BoardPlayerCount}-seat`;
  playerCount: BoardPlayerCount;
  playerIds: readonly PlayerId[];
  sectionSize: 18;
  trackSize: number;
  homeSize: 4;
  piecesPerPlayer: 4;
};

export type RulesetDefinition = {
  id: RulesetId;
  board: BoardDefinition;
  teams: readonly (readonly PlayerId[])[];
  dealSchedule: readonly number[];
  exchange: "none" | "partners";
};

export const BOARD_DEFINITIONS: Readonly<Record<BoardPlayerCount, BoardDefinition>> = {
  2: createBoardDefinition(2),
  3: createBoardDefinition(3),
  4: createBoardDefinition(4),
};

export const CLASSIC_PARTNERS_RULESET: RulesetDefinition = {
  id: "classic-partners-4",
  board: BOARD_DEFINITIONS[4],
  teams: [["P1", "P3"], ["P2", "P4"]],
  dealSchedule: createDealSchedule(4),
  exchange: "partners",
};

export const RULESET_DEFINITIONS: Readonly<Record<RulesetId, RulesetDefinition>> = {
  "free-for-all-2": createFreeForAllRuleset(2),
  "free-for-all-3": createFreeForAllRuleset(3),
  "free-for-all-4": createFreeForAllRuleset(4),
  "classic-partners-4": CLASSIC_PARTNERS_RULESET,
};

export function getRulesetDefinition(rulesetId: RulesetId): RulesetDefinition {
  return RULESET_DEFINITIONS[rulesetId];
}

export function getRulesetForOptions(
  playerCount: BoardPlayerCount,
  teams: boolean,
): RulesetDefinition {
  if (teams) {
    if (playerCount !== 4) {
      throw new RangeError("Team play currently requires four players.");
    }
    return CLASSIC_PARTNERS_RULESET;
  }
  return RULESET_DEFINITIONS[`free-for-all-${playerCount}`];
}

export function createDealSchedule(playerCount: BoardPlayerCount): number[] {
  const fourCardHands = Math.floor(52 / (playerCount * 4));
  const fourCardSchedule = Array.from({ length: fourCardHands }, () => 4);
  const fiveThenFourHands = 52 >= playerCount * 5
    ? 1 + Math.floor((52 - playerCount * 5) / (playerCount * 4))
    : 0;
  const fiveThenFourSchedule = fiveThenFourHands > 0
    ? [5, ...Array.from({ length: fiveThenFourHands - 1 }, () => 4)]
    : [];
  return cardsUsed(fiveThenFourSchedule, playerCount) > cardsUsed(fourCardSchedule, playerCount)
    ? fiveThenFourSchedule
    : fourCardSchedule;
}

export function getBoardDefinition(playerCount: BoardPlayerCount): BoardDefinition {
  return BOARD_DEFINITIONS[playerCount];
}

export function getBoardTrackIndex(
  board: BoardDefinition,
  playerId: PlayerId,
  sectionSpace: number,
): number {
  const playerIndex = board.playerIds.indexOf(playerId);
  if (playerIndex < 0) {
    throw new RangeError(`${playerId} is not seated on the ${board.playerCount}-player board.`);
  }
  if (!Number.isInteger(sectionSpace) || sectionSpace < 1 || sectionSpace > board.sectionSize) {
    throw new RangeError(`Section space must be between 1 and ${board.sectionSize}.`);
  }
  return playerIndex * board.sectionSize + sectionSpace - 1;
}

export function getBoardEntryIndex(board: BoardDefinition, playerId: PlayerId): number {
  return getBoardTrackIndex(board, playerId, board.sectionSize);
}

export function getBoardHomeEntranceIndex(board: BoardDefinition, playerId: PlayerId): number {
  return getBoardTrackIndex(board, playerId, board.sectionSize - 2);
}

function createBoardDefinition(playerCount: BoardPlayerCount): BoardDefinition {
  const sectionSize = 18 as const;
  return {
    id: `tock-${playerCount}-seat`,
    playerCount,
    playerIds: PLAYER_IDS.slice(0, playerCount),
    sectionSize,
    trackSize: sectionSize * playerCount,
    homeSize: 4,
    piecesPerPlayer: 4,
  };
}

function createFreeForAllRuleset(playerCount: BoardPlayerCount): RulesetDefinition {
  const board = BOARD_DEFINITIONS[playerCount];
  return {
    id: `free-for-all-${playerCount}`,
    board,
    teams: board.playerIds.map((playerId) => [playerId]),
    dealSchedule: createDealSchedule(playerCount),
    exchange: "none",
  };
}

function cardsUsed(schedule: readonly number[], playerCount: number): number {
  return schedule.reduce((total, handSize) => total + handSize * playerCount, 0);
}
