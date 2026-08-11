import { selectExchangeCard } from "./deals";
import { discardCardForTurn, playCardForTurn, type CardMove } from "./turns";
import type { Card, GameState, PlayerId } from "./types";
import { assertValidGameState } from "./validation";

export type GameCommand =
  | { type: "select-exchange-card"; actor: PlayerId; cardIndex: number }
  | { type: "play-card"; actor: PlayerId; cardIndex: number; move: CardMove }
  | { type: "discard-card"; actor: PlayerId; cardIndex: number | null };

export type CommandEnvelope = {
  commandId: string;
  expectedRevision: number;
  command: GameCommand;
};

export type GameEvent = {
  commandId: string;
  revision: number;
  command: GameCommand;
  card?: Card | null;
};

export type GameSession = {
  id: string;
  revision: number;
  game: GameState;
  events: GameEvent[];
};

export type SessionCommandErrorCode =
  | "INVALID_COMMAND"
  | "REVISION_CONFLICT"
  | "COMMAND_ID_CONFLICT"
  | "NOT_YOUR_TURN";

export class SessionCommandError extends Error {
  constructor(
    readonly code: SessionCommandErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SessionCommandError";
  }
}

export function createGameSession(id: string, game: GameState): GameSession {
  if (!id.trim()) {
    throw new SessionCommandError("INVALID_COMMAND", "A game session requires an ID.");
  }
  assertValidGameState(game);
  return { id, revision: 0, game, events: [] };
}

export function applySessionCommand(
  session: GameSession,
  envelope: CommandEnvelope,
): GameSession {
  assertCommandEnvelope(envelope);
  const previousEvent = session.events.find((event) => event.commandId === envelope.commandId);
  if (previousEvent) {
    if (JSON.stringify(previousEvent.command) !== JSON.stringify(envelope.command)) {
      throw new SessionCommandError(
        "COMMAND_ID_CONFLICT",
        `Command ID ${envelope.commandId} was already used for a different command.`,
      );
    }
    return session;
  }

  if (envelope.expectedRevision !== session.revision) {
    throw new SessionCommandError(
      "REVISION_CONFLICT",
      `Expected revision ${envelope.expectedRevision}, but the session is at ${session.revision}.`,
    );
  }

  assertActorCanIssueCommand(session.game, envelope.command);

  let game: GameState;
  const card = getCommandCard(session.game, envelope.command);
  try {
    game = applyGameCommand(session.game, envelope.command);
    assertValidGameState(game);
  } catch (error) {
    if (error instanceof SessionCommandError) throw error;
    throw new SessionCommandError(
      "INVALID_COMMAND",
      error instanceof Error ? error.message : "The command is not valid.",
      { cause: error },
    );
  }

  const revision = session.revision + 1;
  return {
    ...session,
    revision,
    game,
    events: [...session.events, {
      commandId: envelope.commandId,
      revision,
      command: envelope.command,
      ...(envelope.command.type === "select-exchange-card" ? {} : { card }),
    }],
  };
}

function getCommandCard(game: GameState, command: GameCommand): Card | null {
  if (command.type === "select-exchange-card" || command.cardIndex === null) return null;
  return game.players.find((player) => player.id === command.actor)?.hand[command.cardIndex] ?? null;
}

function applyGameCommand(game: GameState, command: GameCommand): GameState {
  switch (command.type) {
    case "select-exchange-card":
      return selectExchangeCard(game, command.actor, command.cardIndex);
    case "play-card":
      return playCardForTurn(game, command.cardIndex, command.move);
    case "discard-card":
      return discardCardForTurn(game, command.cardIndex);
  }
}

function assertActorCanIssueCommand(game: GameState, command: GameCommand): void {
  if (!game.players.some((player) => player.id === command.actor)) {
    throw new SessionCommandError("INVALID_COMMAND", `Unknown player ${command.actor}.`);
  }

  if (command.type !== "select-exchange-card" && command.actor !== game.currentPlayer) {
    throw new SessionCommandError(
      "NOT_YOUR_TURN",
      `It is ${game.currentPlayer}'s turn, not ${command.actor}'s.`,
    );
  }
}

function assertCommandEnvelope(envelope: CommandEnvelope): void {
  if (!envelope.commandId.trim() || envelope.commandId.length > 128) {
    throw new SessionCommandError(
      "INVALID_COMMAND",
      "Command IDs must contain between 1 and 128 characters.",
    );
  }
  if (!Number.isSafeInteger(envelope.expectedRevision) || envelope.expectedRevision < 0) {
    throw new SessionCommandError("INVALID_COMMAND", "Expected revision must be a non-negative integer.");
  }
}
