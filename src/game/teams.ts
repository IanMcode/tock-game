import { getRulesetDefinition } from "./definition";
import type { Piece, PlayerId, RulesetId } from "./types";

export function getPartner(
  playerId: PlayerId,
  rulesetId: RulesetId = "classic-partners-4",
): PlayerId {
  const ruleset = getRulesetDefinition(rulesetId);
  const team = ruleset.teams.find((members) => members.includes(playerId));
  const partner = team?.find((candidate) => candidate !== playerId);
  if (!partner) throw new Error(`${playerId} has no partner in ${rulesetId}.`);
  return partner;
}

export function areAllPiecesHome(
  pieces: readonly Piece[],
  playerId: PlayerId,
): boolean {
  const playerPieces = pieces.filter((piece) => piece.owner === playerId);

  return (
    playerPieces.length === 4 &&
    playerPieces.every((piece) => piece.position.zone === "home")
  );
}

export function getControlledPlayer(
  pieces: readonly Piece[],
  playerId: PlayerId,
  rulesetId: RulesetId = "classic-partners-4",
): PlayerId {
  const ruleset = getRulesetDefinition(rulesetId);
  if (ruleset.exchange === "none" || !areAllPiecesHome(pieces, playerId)) return playerId;
  return getPartner(playerId, rulesetId);
}

export function getWinningTeam(
  pieces: readonly Piece[],
  rulesetId: RulesetId = "classic-partners-4",
): readonly PlayerId[] | null {
  const ruleset = getRulesetDefinition(rulesetId);
  return ruleset.teams.find((team) =>
    team.every((playerId) => areAllPiecesHome(pieces, playerId)),
  ) ?? null;
}
