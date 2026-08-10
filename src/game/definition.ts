import { PLAYER_IDS, type GameState, type PlayerId } from "./types";

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
  id: GameState["rulesetId"];
  board: BoardDefinition;
  teams: readonly (readonly PlayerId[])[];
  dealSchedule: readonly [number, number, number];
  exchange: "partners";
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
  dealSchedule: [5, 4, 4],
  exchange: "partners",
};

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
