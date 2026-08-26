import type { PlayerId } from "../game/types";

export type LobbyTeamNumber = 1 | 2;

const TEAM_ONE_SEATS = new Set([0, 2]);

export function getLobbyTeamNumber(seatOrder: readonly PlayerId[], playerId: PlayerId): LobbyTeamNumber {
  const seatIndex = seatOrder.indexOf(playerId);
  if (seatIndex < 0) throw new Error(`${playerId} is not in the lobby seat order.`);
  return TEAM_ONE_SEATS.has(seatIndex) ? 1 : 2;
}

export function moveLobbyPlayerToTeam(
  seatOrder: readonly PlayerId[],
  playerId: PlayerId,
  team: LobbyTeamNumber,
): PlayerId[] {
  assertFourUniquePlayers(seatOrder);
  const playerIndex = seatOrder.indexOf(playerId);
  if (getLobbyTeamNumber(seatOrder, playerId) === team) return [...seatOrder];

  const teammateIndex = seatOrder.findIndex((candidate, index) =>
    candidate !== playerId && (TEAM_ONE_SEATS.has(index) ? 1 : 2) === team);
  if (teammateIndex < 0) throw new Error(`Team ${team} has no player to swap.`);

  const next = [...seatOrder];
  [next[playerIndex], next[teammateIndex]] = [next[teammateIndex], next[playerIndex]];
  return next;
}

export function randomizeLobbyTeamSeats(
  players: readonly PlayerId[],
  random: () => number = Math.random,
): PlayerId[] {
  assertFourUniquePlayers(players);
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return [shuffled[0], shuffled[2], shuffled[1], shuffled[3]];
}

function assertFourUniquePlayers(players: readonly PlayerId[]) {
  if (players.length !== 4 || new Set(players).size !== 4) {
    throw new Error("Team assignment requires four unique players.");
  }
}
