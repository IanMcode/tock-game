"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createOnlineRoom,
  joinOnlineRoom,
  readOnlineRoom,
  requestRoomRealtimeToken,
  sendOnlineCommand,
  startOnlineRoom,
  updateOnlineRoomConfiguration,
  voteOnlineNextGame,
} from "../../src/online/client";
import {
  failedRoomRefreshDelay,
  shouldForgetRoomAfterError,
  shouldPauseRoomRefresh,
} from "../../src/online/polling";
import {
  REALTIME_FALLBACK_REFRESH_DELAY,
  ROOM_UPDATED_EVENT,
  roomChannelName,
} from "../../src/online/realtime";
import type { BoardPlayerCount } from "../../src/game/definition";
import type { CardRank, CharityTurns, PlayerId } from "../../src/game/types";
import type { MatchGameRecord, RoomAccess, RoomView } from "../../src/online/roomService";
import {
  getCurrentDealerRoundEvents,
  getLatestAnimationTurn,
  getReplayStartingPieces,
  getUnseenAnimationTurns,
} from "../../src/online/animation";
import { describePublicGameEvent } from "../../src/online/history";
import { findReceivedExchangeCard } from "../../src/online/exchangeReceipt";
import {
  getLobbyTeamNumber,
  moveLobbyPlayerToTeam,
  randomizeLobbySeats,
  randomizeLobbyTeamSeats,
  type LobbyTeamNumber,
} from "../../src/online/lobbyTeams";
import {
  Board,
  BoardReserve,
  CardFace,
  PlayingCardGraphic,
  SpaceNumberToggle,
  getDefaultPlayerAppearanceVariables,
  getBoardTrackPoint,
  getPiecePoint,
  getSwapControlPoint,
  type DestinationOption,
  type HoppingPiece,
  type SwappingPiece,
} from "../game-table";
import { applyAtomicMove, applyPieceMove, type AtomicMove } from "../../src/game/actions";
import { getLegalBasicCardMoves } from "../../src/game/cardMoves";
import { getNextHandPreview } from "../../src/game/deals";
import { getRulesetDefinition } from "../../src/game/definition";
import type { ForwardMove } from "../../src/game/moves";
import { getMoveAnimationFrames } from "../../src/game/moveAnimation";
import { getSplitSevenDestinationOptions } from "../../src/game/splitSelection";
import type { SplitSevenMove } from "../../src/game/specialMoves";
import type { Card, Piece } from "../../src/game/types";
import type { GameCommand } from "../../src/game/session";
import type { CardMove } from "../../src/game/turns";
import type { PublicGameEvent } from "../../src/game/view";

const ACCESS_KEY = "tock-online-room-access";
const PLAY_LOG_ENTRY_LIMIT = 6;
type PresentedCard = { card: Card; actor: PlayerId; key: string | number };
type ExchangeReceipt = { sent: Card; received: Card };
const PLAYER_LABELS: Record<PlayerId, string> = {
  P1: "Player 1",
  P2: "Player 2",
  P3: "Player 3",
  P4: "Player 4",
};

type OnlineLobbyProps = {
  realtimeEnabled?: boolean;
  entryMode?: "both" | "create" | "join";
};

export default function OnlineLobby({ realtimeEnabled = false, entryMode = "both" }: OnlineLobbyProps) {
  const router = useRouter();
  const [playerCount, setPlayerCount] = useState<BoardPlayerCount>(4);
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lobbySeatOrder, setLobbySeatOrder] = useState<PlayerId[]>([]);
  const [lobbyDealer, setLobbyDealer] = useState<PlayerId | "random">("random");
  const roomStatusRef = useRef<RoomView["status"] | null>(null);

  useEffect(() => {
    roomStatusRef.current = room?.status ?? null;
  }, [room?.status]);

  const connectedLobbyPlayers = room?.status === "waiting"
    ? room.session.game.players
      .map((player) => player.id)
      .filter((playerId) => room.connectedPlayers.includes(playerId))
    : [];
  const effectiveLobbySeatOrder = lobbySeatOrder.length === connectedLobbyPlayers.length
    ? lobbySeatOrder
    : connectedLobbyPlayers;

  useEffect(() => {
    if (entryMode !== "both") return;
    const timeout = window.setTimeout(() => {
      const saved = sessionStorage.getItem(ACCESS_KEY);
      if (!saved) return;
      try {
        setAccess(JSON.parse(saved) as RoomAccess);
      } catch {
        sessionStorage.removeItem(ACCESS_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [entryMode]);

  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    let refreshTimeout: number | undefined;
    let consecutiveFailures = 0;
    let refreshInFlight = false;
    let refreshQueued = false;
    let realtimeConnected = false;
    let realtimeStarting = false;
    let realtimeClient: import("ably").Realtime | undefined;
    let realtimeChannel: import("ably").RealtimeChannel | undefined;

    const onRoomUpdated = () => void refresh();

    const clearRefreshTimeout = () => {
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
      refreshTimeout = undefined;
    };

    const scheduleRefresh = (delay: number) => {
      clearRefreshTimeout();
      if (cancelled || document.visibilityState !== "visible") return;
      refreshTimeout = window.setTimeout(() => void refresh(), delay);
    };

    const closeRealtime = () => {
      realtimeConnected = false;
      realtimeStarting = false;
      if (realtimeChannel) realtimeChannel.unsubscribe(ROOM_UPDATED_EVENT, onRoomUpdated);
      realtimeChannel = undefined;
      realtimeClient?.close();
      realtimeClient = undefined;
    };

    const connectRealtime = async () => {
      if (
        !realtimeEnabled ||
        realtimeStarting ||
        realtimeClient ||
        cancelled ||
        document.visibilityState !== "visible"
      ) return;
      realtimeStarting = true;
      try {
        const { Realtime } = await import("ably");
        if (cancelled || document.visibilityState !== "visible") return;
        const client = new Realtime({
          authCallback: (_params, callback) => {
            void requestRoomRealtimeToken(access.roomId, access.playerToken).then(
              (tokenRequest) => callback(null, tokenRequest),
              (tokenError) => callback(
                tokenError instanceof Error ? tokenError.message : "Unable to authenticate realtime updates.",
                null,
              ),
            );
          },
        });
        realtimeClient = client;
        client.connection.on("connected", () => {
          if (cancelled) return;
          realtimeConnected = true;
          consecutiveFailures = 0;
          clearRefreshTimeout();
          void refresh();
        });
        const onDisconnected = () => {
          if (cancelled) return;
          realtimeConnected = false;
          scheduleRefresh(REALTIME_FALLBACK_REFRESH_DELAY);
        };
        client.connection.on("disconnected", onDisconnected);
        client.connection.on("suspended", onDisconnected);
        client.connection.on("failed", onDisconnected);
        const channel = client.channels.get(roomChannelName(access.roomId));
        realtimeChannel = channel;
        await channel.subscribe(ROOM_UPDATED_EVENT, onRoomUpdated);
      } catch {
        closeRealtime();
        scheduleRefresh(REALTIME_FALLBACK_REFRESH_DELAY);
      } finally {
        realtimeStarting = false;
      }
    };

    const refresh = async () => {
      clearRefreshTimeout();
      if (cancelled || document.visibilityState !== "visible") return;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      try {
        const next = await readOnlineRoom(access.roomId, access.playerToken);
        if (!cancelled) {
          consecutiveFailures = 0;
          roomStatusRef.current = next.status;
          setRoom(next);
          if (next.viewerPlayerId && next.viewerPlayerId !== access.playerId) {
            const nextAccess = { ...access, playerId: next.viewerPlayerId };
            sessionStorage.setItem(ACCESS_KEY, JSON.stringify(nextAccess));
            setAccess(nextAccess);
          }
          setError(null);
          if (!realtimeConnected) {
            scheduleRefresh(REALTIME_FALLBACK_REFRESH_DELAY);
          }
        }
      } catch (refreshError) {
        if (cancelled) return;
        setError(messageFrom(refreshError));
        if (shouldForgetRoomAfterError(refreshError)) {
          sessionStorage.removeItem(ACCESS_KEY);
          roomStatusRef.current = null;
          setAccess(null);
          setRoom(null);
          return;
        }
        consecutiveFailures += 1;
        if (shouldPauseRoomRefresh(consecutiveFailures)) {
          setError(`${messageFrom(refreshError)} Automatic refresh has paused; reload this page to try again.`);
          return;
        }
        scheduleRefresh(failedRoomRefreshDelay(consecutiveFailures));
      } finally {
        refreshInFlight = false;
        if (refreshQueued && !cancelled) {
          refreshQueued = false;
          queueMicrotask(() => void refresh());
        }
      }
    };
    const resumeVisibleRoom = () => {
      if (document.visibilityState === "visible") {
        consecutiveFailures = 0;
        void connectRealtime();
        void refresh();
      } else {
        clearRefreshTimeout();
        closeRealtime();
      }
    };
    if (document.visibilityState === "visible") {
      void connectRealtime();
      void refresh();
    }
    document.addEventListener("visibilitychange", resumeVisibleRoom);
    return () => {
      cancelled = true;
      clearRefreshTimeout();
      closeRealtime();
      document.removeEventListener("visibilitychange", resumeVisibleRoom);
    };
  }, [access, realtimeEnabled]);

  async function createRoom() {
    setBusy(true);
    setError(null);
    try {
      enterRoom((await createOnlineRoom({
        playerCount,
        ...(hostName.trim() ? { playerName: hostName.trim() } : {}),
      })).access);
    } catch (createError) {
      setError(messageFrom(createError));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!/^\d{4}$/.test(joinCode)) return;
    setBusy(true);
    setError(null);
    try {
      enterRoom((await joinOnlineRoom(joinCode, joinName.trim() || undefined)).access);
    } catch (joinError) {
      setError(messageFrom(joinError));
    } finally {
      setBusy(false);
    }
  }

  function assignLobbySeat(index: number, playerId: PlayerId) {
    setLobbySeatOrder((current) => {
      const next = [...(current.length === connectedLobbyPlayers.length ? current : connectedLobbyPlayers)];
      const otherIndex = next.indexOf(playerId);
      if (otherIndex < 0 || otherIndex === index) return current;
      [next[index], next[otherIndex]] = [next[otherIndex], next[index]];
      return next;
    });
  }

  function assignLobbyTeam(playerId: PlayerId, team: LobbyTeamNumber) {
    setLobbySeatOrder(moveLobbyPlayerToTeam(effectiveLobbySeatOrder, playerId, team));
  }

  function randomizeLobbyTeams() {
    setLobbySeatOrder(randomizeLobbyTeamSeats(effectiveLobbySeatOrder));
  }

  function randomizeLobbyBoardPositions() {
    setLobbySeatOrder(randomizeLobbySeats(effectiveLobbySeatOrder));
  }

  async function startRoom() {
    if (!access || !room) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startOnlineRoom(access.roomId, access.playerToken, {
        dealer: lobbyDealer,
        seatOrder: effectiveLobbySeatOrder,
      });
      remember(started.access);
      roomStatusRef.current = started.room.status;
      setRoom(started.room);
    } catch (startError) {
      setError(messageFrom(startError));
    } finally {
      setBusy(false);
    }
  }

  async function updateLobbyConfiguration(configuration: RoomView["configuration"]) {
    if (!access || !room?.isHost) return;
    const previous = room;
    setRoom({ ...room, configuration });
    setBusy(true);
    setError(null);
    try {
      setRoom(await updateOnlineRoomConfiguration(access.roomId, access.playerToken, configuration));
    } catch (configurationError) {
      setRoom(previous);
      setError(messageFrom(configurationError));
    } finally {
      setBusy(false);
    }
  }

  function remember(nextAccess: RoomAccess) {
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify(nextAccess));
    setAccess(nextAccess);
  }

  function enterRoom(nextAccess: RoomAccess) {
    remember(nextAccess);
    if (entryMode !== "both") router.replace("/online");
  }

  function leaveRoom() {
    sessionStorage.removeItem(ACCESS_KEY);
    roomStatusRef.current = null;
    setAccess(null);
    setRoom(null);
    setError(null);
  }

  if (access) {
    if (!room) {
      return (
        <main className="online-shell">
          <section className="room-card" aria-live="polite">
            <p>Connecting to room…</p>
          </section>
        </main>
      );
    }
    const isGameRoom = room?.status === "active" || room?.status === "complete";
    const isLobbyReady = room?.status === "waiting" && room.connectedPlayers.length === room.requiredPlayers;
    const isTeamLobby = Boolean(room?.configuration.teams);
    return (
      <main className={`online-shell ${isGameRoom ? "online-shell-active" : ""}`}>
        {!isGameRoom && <header className="online-header">
          <div>
            <p className="eyebrow">Online room</p>
            <h1>{access.roomId}</h1>
          </div>
          <div className="online-header-actions">
            <Link className="quiet-button" href="/">Home</Link>
          </div>
        </header>}

        {!isGameRoom && <section className="room-card">
          <div className="room-code-block">
            <span>Room code</span>
            <strong>{access.roomId}</strong>
            <button type="button" onClick={() => void navigator.clipboard.writeText(access.roomId)}>Copy code</button>
          </div>
          <div className="room-status-copy">
            <p className="eyebrow">Your seat</p>
            <h2>{room.playerNames[access.playerId] ?? PLAYER_LABELS[access.playerId]} · {access.playerId}</h2>
            <p>{room && room.connectedPlayers.length === room.requiredPlayers
              ? room.isHost ? "Everyone is here. Arrange the table, then start when ready." : "Everyone is here. Waiting for the host to start."
              : `Waiting for ${Math.max(0, (room?.requiredPlayers ?? 0) - (room?.connectedPlayers.length ?? 0))} more player(s).`}</p>
          </div>
        </section>}

        {room?.status === "waiting" && <section className="lobby-rules-panel" aria-label="Rule variants">
          <div>
            <p className="eyebrow">Rule variants</p>
            <h2>Table rules</h2>
            <p>{room.isHost ? "Choose the rules for this game. Everyone in the lobby can see changes." : "The host selected these rules for the game."}</p>
          </div>
          <div className="lobby-rule-options">
            <label className="online-check">
              <input
                type="checkbox"
                checked={room.configuration.teams}
                disabled={!room.isHost || room.requiredPlayers !== 4 || busy}
                onChange={(event) => void updateLobbyConfiguration({ ...room.configuration, teams: event.target.checked })}
              />
              <span><strong>Opposite-seat teams</strong><small>{room.requiredPlayers === 4 ? "Teammates sit opposite one another." : "Available only on the four-player board."}</small></span>
            </label>
            <label className="online-check">
              <input
                type="checkbox"
                checked={room.configuration.startWithPieceOnEntry}
                disabled={!room.isHost || busy}
                onChange={(event) => void updateLobbyConfiguration({ ...room.configuration, startWithPieceOnEntry: event.target.checked })}
              />
              <span><strong>Head start</strong><small>Begin with each player’s first piece protected on entry.</small></span>
            </label>
            <label className="online-variant-select">
              <span><strong>Charity</strong><small>Request a card after consecutive qualifying turns.</small></span>
              <select
                value={room.configuration.charityTurns}
                disabled={!room.isHost || busy}
                onChange={(event) => void updateLobbyConfiguration({ ...room.configuration, charityTurns: Number(event.target.value) as CharityTurns })}
              >
                <option value={0}>No charity</option>
                <option value={1}>1 turn</option>
                <option value={2}>2 turns</option>
                <option value={3}>3 turns</option>
              </select>
            </label>
          </div>
        </section>}

        {room && isLobbyReady && (
          <section className="lobby-start-panel" aria-label="Pre-game table setup">
            <div className="lobby-start-heading">
              <div>
                <p className="eyebrow">Table setup</p>
                <h2>{isTeamLobby ? "Set the teams" : "Choose the turn order"}</h2>
                <p>{isTeamLobby ? "Assign two players to each team. Teammates will be seated opposite one another." : "Arrange the players around the table before starting."}</p>
              </div>
              {!room.isHost && <span>Only the host can change seats and start.</span>}
            </div>
            {room.isHost && (
              <div className="lobby-start-actions">
                {isTeamLobby && <button className="lobby-randomize-seats" type="button" disabled={busy} onClick={randomizeLobbyTeams}>
                  Randomize Teams
                </button>}
                {!isTeamLobby && <button className="lobby-randomize-seats" type="button" disabled={busy} onClick={randomizeLobbyBoardPositions}>
                  Randomize Board Positions
                </button>}
                <label>
                  <span>Who deals first?</span>
                  <select value={lobbyDealer} disabled={busy} onChange={(event) => setLobbyDealer(event.target.value as PlayerId | "random")}>
                    <option value="random">Choose randomly</option>
                    {room.connectedPlayers.map((playerId) => (
                      <option value={playerId} key={playerId}>{room.playerNames[playerId] ?? PLAYER_LABELS[playerId]}</option>
                    ))}
                  </select>
                </label>
                <button className="online-primary" type="button" disabled={busy} onClick={() => void startRoom()}>
                  {busy ? "Starting…" : "Start Game"}
                </button>
              </div>
            )}
          </section>
        )}

        {!isGameRoom && <section className={`seat-grid ${isLobbyReady ? "is-configuring" : ""}`} aria-label="Room seats">
          {room ? Array.from({ length: room.requiredPlayers }, (_, index) => {
            const playerId = `P${index + 1}` as PlayerId;
            const connected = room.connectedPlayers.includes(playerId);
            const assignedSeatIndex = effectiveLobbySeatOrder.indexOf(playerId);
            const assignedSeat = assignedSeatIndex >= 0 ? `P${assignedSeatIndex + 1}` as PlayerId : playerId;
            return (
              <article className={connected ? "seat-card is-connected" : "seat-card"} key={playerId}>
                <span>{playerId}</span>
                <strong>{connected ? room.playerNames[playerId] ?? PLAYER_LABELS[playerId] : "Available"}</strong>
                <small>{connected ? "Connected" : "Open seat"}</small>
                {connected && isLobbyReady && isTeamLobby && <label className="seat-team-control">
                  <span>Team</span>
                  <select
                    value={getLobbyTeamNumber(effectiveLobbySeatOrder, playerId)}
                    disabled={!room.isHost || busy}
                    onChange={(event) => assignLobbyTeam(playerId, Number(event.target.value) as LobbyTeamNumber)}
                  >
                    <option value={1}>Team 1</option>
                    <option value={2}>Team 2</option>
                  </select>
                  <small>Opposite seat · {assignedSeat}</small>
                </label>}
                {connected && isLobbyReady && !isTeamLobby && <label className="seat-team-control">
                  <span>Board position</span>
                  <select
                    value={assignedSeatIndex}
                    disabled={!room.isHost || busy}
                    onChange={(event) => assignLobbySeat(Number(event.target.value), playerId)}
                  >
                    {effectiveLobbySeatOrder.map((_, seatIndex) => <option value={seatIndex} key={seatIndex}>Position {seatIndex + 1}</option>)}
                  </select>
                </label>}
              </article>
            );
          }) : <p>Connecting to room…</p>}
        </section>}

        {room && room.status !== "waiting" && (
          <OnlineRoomTable key={`game-${room.currentGameNumber}`} access={access} room={room} onRoom={setRoom} onAccess={remember} onLeaveRoom={leaveRoom} />
        )}
        {error && <p className="online-error" role="alert">{error}</p>}
        {!isGameRoom && <button className="leave-room-button" type="button" onClick={leaveRoom}>Forget this room on this tab</button>}
      </main>
    );
  }

  const isCreatePage = entryMode === "create";
  const isJoinPage = entryMode === "join";
  return (
    <main className={`online-shell online-entry-shell online-entry-${entryMode}`}>
      <header className="online-header">
        <div>
          <p className="eyebrow">{isJoinPage ? "Have a code?" : isCreatePage ? "Host a private table" : "Guest multiplayer"}</p>
          <h1>{isJoinPage ? "Join a game" : isCreatePage ? "Create a game" : "Play Tock online"}</h1>
        </div>
        <Link className="quiet-button" href="/">Back home</Link>
      </header>

      <div className="online-options-grid">
        {!isJoinPage && <form className="online-panel" onSubmit={(event) => { event.preventDefault(); void createRoom(); }}>
          <p className="eyebrow">Host a table</p>
          <h2>Game details</h2>
          <label>
            <span>Your name</span>
            <input required value={hostName} maxLength={24} autoComplete="nickname" onChange={(event) => setHostName(event.target.value)} placeholder="Your name" />
          </label>
          <label>
            <span>Players</span>
            <select value={playerCount} onChange={(event) => {
              const count = Number(event.target.value) as BoardPlayerCount;
              setPlayerCount(count);
            }}>
              <option value={2}>2 players</option>
              <option value={3}>3 players</option>
              <option value={4}>4 players</option>
            </select>
          </label>
          <button className="online-primary" type="submit" disabled={busy}>{busy ? "Creating game…" : "Create Game"}</button>
        </form>}

        {!isCreatePage && <form className="online-panel" onSubmit={(event) => { event.preventDefault(); void joinRoom(); }}>
          <p className="eyebrow">Have a code?</p>
          <h2>Join a private game</h2>
          <label>
            <span>Your name</span>
            <input required value={joinName} maxLength={24} autoComplete="nickname" onChange={(event) => setJoinName(event.target.value)} placeholder="Your name" />
          </label>
          <label>
            <span>Four-digit room code</span>
            <input
              value={joinCode}
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]{4}"
              onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="2048"
            />
          </label>
          <button className="online-primary" type="submit" disabled={busy || !/^\d{4}$/.test(joinCode)}>{busy ? "Joining game…" : "Join Game"}</button>
          <p className="online-help">Your reconnect token stays in this browser tab. Share only the room code.</p>
        </form>}
      </div>
      {error && <p className="online-error" role="alert">{error}</p>}
    </main>
  );
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The online request failed.";
}

function OnlineRoomTable({
  access,
  room,
  onRoom,
  onAccess,
  onLeaveRoom,
}: {
  access: RoomAccess;
  room: RoomView;
  onRoom: (room: RoomView) => void;
  onAccess: (access: RoomAccess) => void;
  onLeaveRoom: () => void;
}) {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [splitSteps, setSplitSteps] = useState<ForwardMove[]>([]);
  const [destinationMoves, setDestinationMoves] = useState<DestinationOption[]>([]);
  const [showNumbers, setShowNumbers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hoppingPieces, setHoppingPieces] = useState<HoppingPiece[]>([]);
  const [swappingPieces, setSwappingPieces] = useState<SwappingPiece[]>([]);
  const [capturingPieceIds, setCapturingPieceIds] = useState<string[]>([]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isDealing, setIsDealing] = useState(false);
  const [pendingDealKey, setPendingDealKey] = useState<string | null>(null);
  const [pendingDealClearsCards, setPendingDealClearsCards] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [victoryPanel, setVictoryPanel] = useState<"rematch" | "statistics" | null>(null);
  const [rematchRandomizeSeats, setRematchRandomizeSeats] = useState(true);
  const [rematchDealer, setRematchDealer] = useState<PlayerId | "random">("random");
  const [rematchBusy, setRematchBusy] = useState(false);
  const [submittedExchange, setSubmittedExchange] = useState<{ card: Card; index: number } | null>(null);
  const [exchangeReceipt, setExchangeReceipt] = useState<ExchangeReceipt | null>(null);
  const [requestedCharityRank, setRequestedCharityRank] = useState<CardRank>("A");
  const game = room.session.game;
  const ruleset = getRulesetDefinition(game.rulesetId);
  const viewer = game.players.find((player) => player.id === access.playerId);
  const hand = useMemo(() => viewer?.hand ?? [], [viewer]);
  const pieces = useMemo(() => game.players.flatMap((player) => player.pieces), [game.players]);
  const [displayPieces, setDisplayPieces] = useState<Piece[]>(() => [...pieces]);
  const displayPiecesRef = useRef<Piece[]>([...pieces]);
  const displayedRevisionRef = useRef(room.session.revision);
  const animationRunRef = useRef(0);
  const [displayedCards, setDisplayedCards] = useState<PresentedCard[]>(() =>
    getPresentedCards(room.session.events ?? []));
  const [incomingCard, setIncomingCard] = useState<PresentedCard | null>(null);
  const selectedCard = selectedCardIndex === null ? null : hand[selectedCardIndex] ?? null;
  const isMyTurn = game.phase === "play" && game.currentPlayer === access.playerId && !game.winningTeam;
  const rematchDecliners = game.players
    .map((player) => player.id)
    .filter((playerId) => room.rematchVote?.votes[playerId] === "declined");
  const rematchWasDeclined = rematchDecliners.length > 0;
  const rematchVoteSignal = room.rematchVote
    ? `${room.rematchVote.requestedBy}:${game.players.map((player) => room.rematchVote?.votes[player.id] ?? "waiting").join(",")}`
    : "";
  const previousRematchVoteSignal = useRef(rematchVoteSignal);
  const charityRequestRequired = game.charityTurns > 0 &&
    (game.charityCounts[access.playerId] ?? 0) >= game.charityTurns &&
    !game.charityExchange;
  const isCharityRequester = game.charityExchange?.requester === access.playerId;
  const canTakeNormalTurn = isMyTurn && !charityRequestRequired && !game.charityExchange;
  const forcedDiscard = game.forcedDiscardPlayer === access.playerId;
  const dealKey = `${game.dealer}-${game.dealIndex}`;
  const previousDealKey = useRef(dealKey);
  const previousDealer = useRef(game.dealer);

  useEffect(() => {
    if (
      rematchVoteSignal &&
      (!previousRematchVoteSignal.current || previousRematchVoteSignal.current.includes("declined"))
    ) setVictoryPanel("rematch");
    previousRematchVoteSignal.current = rematchVoteSignal;
  }, [rematchVoteSignal]);

  const previousPhase = useRef(game.phase);
  const exchangeSubmission = useRef<{ sent: Card; handBefore: Card[] } | null>(null);
  const setVisualPieces = useCallback((next: readonly Piece[]) => {
    const copy = next.map((piece) => ({ ...piece, position: { ...piece.position } }));
    displayPiecesRef.current = copy;
    setDisplayPieces(copy);
  }, []);
  const recentEvents = useMemo(
    () => (room.session.events ?? []).filter((event) => event.type !== "exchange").slice(-PLAY_LOG_ENTRY_LIMIT).reverse(),
    [room.session.events],
  );
  const latestEvent = recentEvents[0];
  const latestCard = latestEvent?.card ?? game.discardPile.at(-1) ?? null;
  const latestAnimationTurn = useMemo(
    () => getLatestAnimationTurn(room.session.events ?? []),
    [room.session.events],
  );
  const replayStartingPieces = useMemo(
    () => latestAnimationTurn
      ? getReplayStartingPieces(pieces, latestAnimationTurn.event)
      : null,
    [latestAnimationTurn, pieces],
  );
  const canReplayLastTurn = Boolean(
    latestAnimationTurn &&
    (latestAnimationTurn.moves.length === 0 || replayStartingPieces),
  );
  const presentCard = useCallback(async (
    presentation: PresentedCard,
    shouldContinue: () => boolean = () => true,
  ) => {
    setIncomingCard(presentation);
    await waitForOnlineAnimation(ONLINE_CARD_PLAY_DURATION);
    if (!shouldContinue()) {
      setIncomingCard((current) => current?.key === presentation.key ? null : current);
      return false;
    }
    setDisplayedCards((current) => [
      presentation,
      ...current.filter((candidate) => candidate.key !== presentation.key),
    ].slice(0, 2));
    await waitForOnlineAnimation(ONLINE_CARD_SETTLE_DURATION);
    if (!shouldContinue()) {
      setIncomingCard((current) => current?.key === presentation.key ? null : current);
      return false;
    }
    setIncomingCard((current) => current?.key === presentation.key ? null : current);
    return true;
  }, []);
  const matchTotals = useMemo(() => getMatchTotals(room.matchHistory), [room.matchHistory]);
  const winnerNames = game.winningTeam?.map((playerId) => room.playerNames[playerId] ?? PLAYER_LABELS[playerId]) ?? [];
  const nextHand = getNextHandPreview(game);

  useEffect(() => {
    if (previousDealKey.current === dealKey) return;
    const dealerChanged = previousDealer.current !== game.dealer;
    previousDealKey.current = dealKey;
    previousDealer.current = game.dealer;
    setPendingDealKey(dealKey);
    setPendingDealClearsCards(dealerChanged);
  }, [dealKey, game.dealer]);

  useEffect(() => {
    const wasExchange = previousPhase.current === "exchange";
    previousPhase.current = game.phase;
    if (!wasExchange || game.phase !== "play" || !exchangeSubmission.current) return;

    const { sent, handBefore } = exchangeSubmission.current;
    const received = findReceivedExchangeCard(handBefore, hand, sent);
    exchangeSubmission.current = null;
    setSubmittedExchange(null);
    if (received) setExchangeReceipt({ sent, received });
  }, [game.phase, hand]);

  useEffect(() => {
    if (!exchangeReceipt) return;
    const timeout = window.setTimeout(() => setExchangeReceipt(null), ONLINE_EXCHANGE_RECEIPT_DURATION);
    return () => window.clearTimeout(timeout);
  }, [exchangeReceipt]);

  useEffect(() => {
    if (!pendingDealKey || isAnimating || incomingCard || isDealing) return;
    const pauseTimeout = window.setTimeout(() => {
      if (pendingDealClearsCards) {
        setDisplayedCards([]);
        setIncomingCard(null);
      }
      setIsDealing(true);
    }, ONLINE_POST_TURN_DEAL_PAUSE);
    return () => window.clearTimeout(pauseTimeout);
  }, [incomingCard, isAnimating, isDealing, pendingDealClearsCards, pendingDealKey]);

  useEffect(() => {
    if (!isDealing) return;
    const dealTimeout = window.setTimeout(() => {
      setIsDealing(false);
      setPendingDealKey(null);
      setPendingDealClearsCards(false);
    }, ONLINE_DEAL_DURATION);
    return () => window.clearTimeout(dealTimeout);
  }, [isDealing]);

  useEffect(() => {
    const targetRevision = room.session.revision;
    if (targetRevision <= displayedRevisionRef.current) return;

    const previousRevision = displayedRevisionRef.current;
    displayedRevisionRef.current = targetRevision;
    const finalPieces = pieces.map((piece) => ({ ...piece, position: { ...piece.position } }));

    const unseenTurns = getUnseenAnimationTurns(
      room.session.events ?? [],
      previousRevision,
      targetRevision,
    );

    if (unseenTurns.length === 0) {
      setVisualPieces(finalPieces);
      setDisplayedCards(getPresentedCards(room.session.events ?? []));
      return;
    }

    const runId = ++animationRunRef.current;
    setIsAnimating(true);
    setSelectedCardIndex(null);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);

    void (async () => {
      let animatedPieces = displayPiecesRef.current;
      for (const turn of unseenTurns) {
        if (!turn.event.card || animationRunRef.current !== runId) return animatedPieces;
        await presentCard({
          card: turn.event.card,
          actor: turn.event.actor,
          key: turn.revision,
        }, () => animationRunRef.current === runId);
        if (animationRunRef.current !== runId) return animatedPieces;
        if (turn.moves.length === 0) continue;
        animatedPieces = await animateOnlineMoves({
          startingPieces: animatedPieces,
          moves: turn.moves,
          board: ruleset.board,
          setHoppingPieces,
          setSwappingPieces,
          setCapturingPieceIds,
          onPiecesChanged: setVisualPieces,
          shouldContinue: () => animationRunRef.current === runId,
        });
      }
      return animatedPieces;
    })().then(() => {
      if (animationRunRef.current !== runId) return;
      setVisualPieces(finalPieces);
      if (!unseenTurns.some((turn) => turn.event.startsNewDealerRound)) {
        setDisplayedCards(getPresentedCards(room.session.events ?? []));
      }
      setHoppingPieces([]);
      setSwappingPieces([]);
      setCapturingPieceIds([]);
      setIsAnimating(false);
    }).catch((animationError) => {
      if (animationRunRef.current !== runId) return;
      setVisualPieces(finalPieces);
      setDisplayedCards(getPresentedCards(room.session.events ?? []));
      setIncomingCard(null);
      setHoppingPieces([]);
      setSwappingPieces([]);
      setCapturingPieceIds([]);
      setIsAnimating(false);
      setCommandError(messageFrom(animationError));
    });
  }, [pieces, presentCard, room.session.events, room.session.revision, ruleset.board, setVisualPieces]);
  const legalMoves = useMemo(() =>
    selectedCard && canTakeNormalTurn && !forcedDiscard
      ? getLegalBasicCardMoves(pieces, access.playerId, selectedCard, game.rulesetId)
      : [],
  [access.playerId, canTakeNormalTurn, forcedDiscard, game.rulesetId, pieces, selectedCard]);
  const playableIndexes = useMemo(() =>
    !canTakeNormalTurn || forcedDiscard ? [] : hand.flatMap((card, index) =>
      getLegalBasicCardMoves(pieces, access.playerId, card, game.rulesetId).length ? [index] : [],
    ),
  [access.playerId, canTakeNormalTurn, forcedDiscard, game.rulesetId, hand, pieces]);
  const isSplitSeven = selectedCard?.rank === "7";
  const previewPieces = useMemo(() => splitSteps.reduce<Piece[]>(
    (current, step) => applyPieceMove(current, step),
    pieces,
  ), [pieces, splitSteps]);
  const renderedPieces = isSplitSeven && !busy ? previewPieces : displayPieces;
  const matchingSplitMoves = useMemo(() => !isSplitSeven ? [] : (legalMoves as SplitSevenMove[]).filter(
    (move) => splitSteps.every((step, index) => JSON.stringify(move.steps[index]) === JSON.stringify(step)),
  ), [isSplitSeven, legalMoves, splitSteps]);
  const activePieceIds = useMemo(() => {
    if (!selectedCard || busy || isAnimating || isDealing) return new Set<string>();
    if (isSplitSeven) {
      return new Set(matchingSplitMoves
        .map((move) => move.steps[splitSteps.length]?.pieceId)
        .filter((pieceId): pieceId is string => Boolean(pieceId)));
    }
    return new Set(legalMoves.filter((move): move is AtomicMove => move.kind !== "split7").map((move) => move.pieceId));
  }, [busy, isAnimating, isDealing, isSplitSeven, legalMoves, matchingSplitMoves, selectedCard, splitSteps.length]);
  const boardPlayers = game.players.map((player) => ({
    id: player.id,
    pieces: player.pieces,
    hand: Array.from({ length: player.handCount }, () => ({ rank: "A" as const, suit: "spades" as const })),
  }));
  const alreadyExchanged = Boolean(game.exchangeSelections[access.playerId]);
  const onlyFivesPlayable = playableIndexes.length > 0 && playableIndexes.every((index) => hand[index]?.rank === "5");
  const mustDiscardForNoLegalMove = canTakeNormalTurn && !forcedDiscard && hand.length > 0 && playableIndexes.length === 0;
  const canDiscard = selectedCardIndex !== null && (
    forcedDiscard || playableIndexes.length === 0 || (onlyFivesPlayable && selectedCard?.rank !== "5")
  );
  const hasSelection = selectedCardIndex !== null || selectedPieceId !== null || splitSteps.length > 0 || destinationMoves.length > 0;

  function resetSelection() {
    setSelectedCardIndex(null);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);
  }

  function chooseCard(index: number) {
    if (busy || isAnimating || isDealing) return;
    if (isCharityRequester && index === hand.length - 1) return;
    setSelectedCardIndex(index);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);
  }

  async function discardCard(index: number | null) {
    if (busy || isAnimating || isDealing || !canTakeNormalTurn) return;
    await submit({ type: "discard-card", actor: access.playerId, cardIndex: index });
  }

  async function requestCharity() {
    if (!isMyTurn || !charityRequestRequired) return;
    await submit({ type: "request-charity-card", actor: access.playerId, rank: requestedCharityRank });
  }

  async function returnCharity() {
    if (!isCharityRequester || selectedCardIndex === null) return;
    await submit({ type: "return-charity-card", actor: access.playerId, cardIndex: selectedCardIndex });
  }

  function choosePiece(pieceId: string) {
    if (busy || isAnimating || isDealing || !selectedCard || !activePieceIds.has(pieceId)) return;
    setSelectedPieceId(pieceId);
    if (isSplitSeven) {
      const options = getSplitSevenDestinationOptions(matchingSplitMoves, splitSteps.length, pieceId);
      setDestinationMoves(options.map((option) => ({
        move: option.steps[option.steps.length - 1],
        splitSteps: option.steps,
      })));
      return;
    }
    setDestinationMoves(uniqueOnlineMoves(
      legalMoves.filter((move): move is AtomicMove => move.kind !== "split7" && move.pieceId === pieceId),
    ).map((move) => ({ move })));
  }

  async function chooseDestination(option: DestinationOption) {
    if (busy || isAnimating || isDealing || !selectedCard) return;
    setDestinationMoves([]);

    if (isSplitSeven && option.splitSteps) {
      const nextSteps = [...splitSteps, ...option.splitSteps];
      if (nextSteps.length >= 7) {
        const complete = matchingSplitMoves.find((move) =>
          nextSteps.every((step, index) => JSON.stringify(move.steps[index]) === JSON.stringify(step)),
        );
        if (complete) await playMove(complete);
        return;
      }

      setIsAnimating(true);
      try {
        await animateOnlineMoves({
          startingPieces: previewPieces,
          moves: option.splitSteps,
          board: ruleset.board,
          setHoppingPieces,
          setSwappingPieces,
          setCapturingPieceIds,
        });
        setSplitSteps(nextSteps);
        setSelectedPieceId(null);
      } finally {
        setHoppingPieces([]);
        setSwappingPieces([]);
        setCapturingPieceIds([]);
        setIsAnimating(false);
      }
      return;
    }

    await playMove(option.move);
  }

  async function playMove(move: CardMove) {
    if (selectedCardIndex === null) return;
    await submit({ type: "play-card", actor: access.playerId, cardIndex: selectedCardIndex, move });
  }

  async function passSelectedExchangeCard() {
    if (selectedCardIndex === null || !selectedCard || alreadyExchanged || busy) return;
    exchangeSubmission.current = { sent: selectedCard, handBefore: [...hand] };
    setSubmittedExchange({ card: selectedCard, index: selectedCardIndex });
    const submitted = await submit({
      type: "select-exchange-card",
      actor: access.playerId,
      cardIndex: selectedCardIndex,
    });
    if (!submitted) {
      exchangeSubmission.current = null;
      setSubmittedExchange(null);
    }
  }

  async function submit(command: GameCommand): Promise<boolean> {
    setBusy(true);
    setCommandError(null);
    try {
      const next = await sendOnlineCommand(access.roomId, access.playerToken, {
        commandId: crypto.randomUUID(),
        expectedRevision: room.session.revision,
        command,
      });
      onRoom(next);
      resetSelection();
      return true;
    } catch (submitError) {
      displayPiecesRef.current = [...pieces];
      setDisplayPieces([...pieces]);
      setIncomingCard(null);
      setCommandError(messageFrom(submitError));
      try {
        onRoom(await readOnlineRoom(access.roomId, access.playerToken));
      } catch {
        // Keep the command error visible if refreshing also fails.
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function replayLastTurn() {
    if (
      busy ||
      isAnimating ||
      isDealing ||
      pendingDealKey ||
      !latestAnimationTurn?.event.card ||
      !canReplayLastTurn ||
      !replayStartingPieces
    ) return;

    const turn = latestAnimationTurn;
    const replayCard = turn.event.card;
    if (!replayCard) return;
    const runId = ++animationRunRef.current;
    const finalPieces = pieces.map((piece) => ({ ...piece, position: { ...piece.position } }));
    const finalCards = getPresentedCards(room.session.events ?? []);
    const priorCards = getPresentedCards(
      (room.session.events ?? []).filter((event) => event.revision < turn.revision),
    );
    const shouldContinue = () => animationRunRef.current === runId;

    resetSelection();
    setIsReplaying(true);
    setIsAnimating(true);
    setIncomingCard(null);
    setDisplayedCards(priorCards);
    setVisualPieces(replayStartingPieces);

    try {
      await waitForOnlineAnimation(ONLINE_REPLAY_RESET_PAUSE);
      if (!shouldContinue()) return;
      const cardPresented = await presentCard({
        card: replayCard,
        actor: turn.event.actor,
        key: `replay-${turn.revision}-${runId}`,
      }, shouldContinue);
      if (!cardPresented || !shouldContinue()) return;
      if (turn.moves.length > 0) {
        await animateOnlineMoves({
          startingPieces: replayStartingPieces,
          moves: turn.moves,
          board: ruleset.board,
          setHoppingPieces,
          setSwappingPieces,
          setCapturingPieceIds,
          onPiecesChanged: setVisualPieces,
          shouldContinue,
        });
      }
      if (!shouldContinue()) return;
      await waitForOnlineAnimation(ONLINE_REPLAY_END_PAUSE);
      if (!shouldContinue()) return;
      setVisualPieces(finalPieces);
      setDisplayedCards(finalCards);
    } catch (replayError) {
      if (shouldContinue()) setCommandError(messageFrom(replayError));
    } finally {
      setIsReplaying(false);
      if (shouldContinue()) {
        setVisualPieces(finalPieces);
        setDisplayedCards(finalCards);
        setIncomingCard(null);
        setHoppingPieces([]);
        setSwappingPieces([]);
        setCapturingPieceIds([]);
        setIsAnimating(false);
      }
    }
  }

  async function createRematch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRematchBusy(true);
    setCommandError(null);
    try {
      const next = await voteOnlineNextGame(access.roomId, access.playerToken, {
        vote: "request",
        dealer: rematchDealer,
        randomizeSeats: rematchRandomizeSeats,
      });
      onAccess(next.access);
      onRoom(next.room);
    } catch (rematchError) {
      setCommandError(messageFrom(rematchError));
    } finally {
      setRematchBusy(false);
    }
  }

  async function answerRematch(vote: "accept" | "decline") {
    setRematchBusy(true);
    setCommandError(null);
    try {
      const next = await voteOnlineNextGame(access.roomId, access.playerToken, { vote });
      onAccess(next.access);
      onRoom(next.room);
    } catch (rematchError) {
      setCommandError(messageFrom(rematchError));
    } finally {
      setRematchBusy(false);
    }
  }

  const handPanel = (
    <div className={`online-hand-panel ${isMyTurn ? "is-my-turn" : ""} ${forcedDiscard ? "is-forced-discard" : ""}`}>
      <div>
        <p className="eyebrow">Your hand</p>
        <strong>{room.playerNames[access.playerId] ?? PLAYER_LABELS[access.playerId]}</strong>
      </div>
      {forcedDiscard && <strong className="forced-discard-prompt">10 played · discard one card</strong>}
      {isMyTurn && charityRequestRequired && (
        <div className="online-charity-panel" role="group" aria-label="Request a charity card">
          <strong>Charity earned</strong>
          <label>
            <span>Request</span>
            <select value={requestedCharityRank} onChange={(event) => setRequestedCharityRank(event.target.value as CardRank)}>
              {(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const).map((rank) => <option value={rank} key={rank}>{rank}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void requestCharity()}>Request card</button>
        </div>
      )}
      {game.charityExchange && (
        <div className="online-charity-panel is-exchanging" role="status">
          <strong>{room.playerNames[game.charityExchange.donor] ?? PLAYER_LABELS[game.charityExchange.donor]} supplied the requested {game.charityExchange.requestedRank}</strong>
          {isCharityRequester
            ? <span>Choose one of your original cards to return.</span>
            : <span>Waiting for {room.playerNames[game.charityExchange.requester] ?? PLAYER_LABELS[game.charityExchange.requester]} to return a card.</span>}
        </div>
      )}
      <div className="online-hand">
        {hand.map((card, index) => (
          <button
            type="button"
            className={`online-card ${(card.suit === "hearts" || card.suit === "diamonds") ? "red" : ""} ${selectedCardIndex === index ? "is-selected" : ""} ${submittedExchange?.index === index ? "is-exchange-selected" : ""}`}
            disabled={busy || isDealing || (game.phase === "exchange"
              ? alreadyExchanged
              : isCharityRequester
                ? index === hand.length - 1
                : !canTakeNormalTurn)}
            style={{ "--deal-card-index": index } as React.CSSProperties}
            aria-label={`${card.rank} of ${card.suit}`}
            onClick={() => chooseCard(index)}
            onDoubleClick={() => {
              const canDoubleClickDiscard = forcedDiscard ||
                playableIndexes.length === 0 ||
                (onlyFivesPlayable && card.rank !== "5");
              if (canDoubleClickDiscard) discardCard(index);
            }}
            title={forcedDiscard || mustDiscardForNoLegalMove || (onlyFivesPlayable && card.rank !== "5")
              ? "Double-click to discard this card"
              : undefined}
            key={`${card.rank}-${card.suit}-${index}`}
          >
            <CardFace card={card} />
          </button>
        ))}
        {hand.length === 0 && <span className="online-empty-hand">No cards remaining</span>}
      </div>
      {game.phase === "exchange" && !alreadyExchanged && <div className="online-hand-actions exchange-actions">
        <button className="online-cancel-selection" type="button" disabled={busy || selectedCardIndex === null} onClick={() => resetSelection()}>
          Cancel selection
        </button>
        <button className="online-pass-card" type="button" disabled={busy || selectedCardIndex === null} onClick={() => void passSelectedExchangeCard()}>
          Pass selected card
        </button>
      </div>}
      {game.phase === "exchange" && <p>{alreadyExchanged ? "Card locked in. Waiting for the other players to choose." : selectedCardIndex === null ? "Choose one card to pass to your teammate." : "Selected card ready. Pass it, or cancel and choose another."}</p>}
      {game.phase === "play" && <div className="online-hand-actions">
        <button className="online-cancel-selection" type="button" disabled={busy || isDealing || !isMyTurn || !hasSelection} onClick={() => resetSelection()}>
          Cancel selection
        </button>
        {isCharityRequester ? <button
          className="online-pass-card"
          type="button"
          disabled={busy || selectedCardIndex === null}
          onClick={() => void returnCharity()}
        >Return selected card</button> : <button
          className="online-discard"
          type="button"
          disabled={busy || isDealing || !canTakeNormalTurn || (!canDiscard && !(forcedDiscard && hand.length === 0))}
          onClick={() => discardCard(hand.length === 0 ? null : selectedCardIndex)}
        >
          Discard selected card
        </button>}
      </div>}
      {forcedDiscard && hand.length > 0 && <p>Choose a card, then discard—or double-click it.</p>}
      {mustDiscardForNoLegalMove && <p>No legal moves are available. You must discard—double-click a card, or select it and use the discard button.</p>}
      {selectedCard && canTakeNormalTurn && !forcedDiscard && !mustDiscardForNoLegalMove && (
        <p>{legalMoves.length === 0
          ? canDiscard
            ? "This card has no legal move and may be discarded—double-click it or use the discard button."
            : "This card has no legal move while another card can be played. Choose a different card."
          : destinationMoves.length ? "Choose a glowing destination." : "Choose a glowing piece."}</p>
      )}
      {exchangeReceipt && <div className="online-exchange-receipt" role="status" aria-live="polite">
        <article>
          <span>Sent to partner</span>
          <PlayingCardGraphic card={exchangeReceipt.sent} />
        </article>
        <i aria-hidden="true">→</i>
        <article>
          <span>Received from partner</span>
          <PlayingCardGraphic card={exchangeReceipt.received} />
        </article>
      </div>}
    </div>
  );
  const animatedPieceIds = new Set([
    ...hoppingPieces.map((animated) => animated.piece.id),
    ...swappingPieces.map((animated) => animated.piece.id),
  ]);
  const localPlayerDock = (
    <div className="online-local-player-dock is-hand-only">
      {handPanel}
    </div>
  );

  return (
    <section className={`online-table ${isAnimating ? "is-animating" : ""} ${isDealing ? "is-dealing" : ""}`} style={{
      ...getDefaultPlayerAppearanceVariables(),
      "--hop-duration": `${ONLINE_HOP_DURATION}ms`,
      "--swap-duration": `${ONLINE_SWAP_DURATION}ms`,
    } as React.CSSProperties}>
      <div className="online-game-viewport">
        <div className="online-status-rail has-player-status">
          <div className="online-room-turn-card">
            <div className="online-room-heading-row">
              <div>
                <p className="eyebrow">Online room · {access.roomId} · revision {room.session.revision}</p>
                <h2>{game.winningTeam ? `${room.playerNames[game.winningTeam[0]] ?? PLAYER_LABELS[game.winningTeam[0]]} has won` : game.phase === "exchange" ? "Blind team exchange" : `${room.playerNames[game.currentPlayer] ?? PLAYER_LABELS[game.currentPlayer]}'s turn`}</h2>
                <span>{room.playerNames[access.playerId] ?? PLAYER_LABELS[access.playerId]} · {access.playerId} · {room.connectedPlayers.length} connected</span>
                {!isMyTurn && game.phase === "play" && !game.winningTeam && <span>Waiting for another player…</span>}
              </div>
              <SpaceNumberToggle shown={showNumbers} onToggle={() => setShowNumbers((shown) => !shown)} />
            </div>
            <div className="online-room-actions">
              <button type="button" onClick={() => void navigator.clipboard.writeText(access.roomId)}>Copy {access.roomId}</button>
              <button type="button" onClick={onLeaveRoom}>Leave</button>
              <Link href="/">Home</Link>
            </div>
          </div>
          <div className="online-player-status-list" aria-label="Players at the table">
            {ruleset.board.playerIds.map((playerId) => (
              <div className="online-player-status-row" key={`${playerId}-status`}>
                <BoardReserve
                owner={playerId}
                pieces={renderedPieces}
                player={boardPlayers.find((player) => player.id === playerId)}
                playerName={room.playerNames[playerId] ?? PLAYER_LABELS[playerId]}
                dealer={game.dealer}
                dealIndex={game.dealIndex}
                dealCount={ruleset.dealSchedule.length}
                activePieceIds={activePieceIds}
                animatedPieceIds={animatedPieceIds}
                selectedPieceId={selectedPieceId}
                capturingPieceIds={capturingPieceIds}
                onPieceClick={choosePiece}
                showReservePieces={false}
                statusLine={game.charityTurns > 0 ? <span className="online-player-charity" title="Charity progress" aria-label={`Charity ${game.charityCounts[playerId] ?? 0} of ${game.charityTurns}`}>
                  Charity: {game.charityCounts[playerId] ?? 0}/{game.charityTurns}
                </span> : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="online-board-stage">
        <Board
          pieces={renderedPieces}
          boardDefinition={ruleset.board}
          teamMode={ruleset.exchange === "partners"}
          activePieceIds={activePieceIds}
          hoppingPieces={hoppingPieces}
          swappingPieces={swappingPieces}
          capturingPieceIds={capturingPieceIds}
          players={boardPlayers}
          playerNames={room.playerNames}
          dealer={game.dealer}
          dealIndex={game.dealIndex}
          dealCount={ruleset.dealSchedule.length}
          currentPlayerId={game.currentPlayer}
          selectedPieceId={selectedPieceId}
          destinationMoves={destinationMoves}
          showSpaceNumbers={showNumbers}
          onToggleSpaceNumbers={() => setShowNumbers((shown) => !shown)}
          onPieceClick={choosePiece}
          onDestinationClick={(option) => void chooseDestination(option)}
          recentCard={displayedCards[0]?.card ?? null}
          previousCard={displayedCards[1]?.card ?? null}
          incomingCard={incomingCard?.card ?? null}
          incomingCardActor={incomingCard?.actor ?? null}
          incomingCardKey={incomingCard?.key}
          perspectivePlayerId={access.playerId}
          externalReservePlayerId={access.playerId}
          reservePresentation="board-grid"
          showToolbar={false}
          showLegend={false}
        />
        {game.winningTeam && (
          <section className="online-victory" aria-label="Game complete">
            <p className="eyebrow">Game complete</p>
            <h2>{winnerNames.join(" and ")} Win!</h2>
            <p>{winnerNames.length > 1 ? "Every team piece made it home." : "All four pieces made it home first."}</p>
            <div className="online-victory-actions">
              <button type="button" onClick={() => setVictoryPanel((panel) => panel === "rematch" ? null : "rematch")}>Play another game</button>
              <button type="button" onClick={() => setVictoryPanel((panel) => panel === "statistics" ? null : "statistics")}>Show match statistics</button>
            </div>
            {victoryPanel === "rematch" && (
              <div className="online-rematch-options">
                {rematchWasDeclined && <p className="online-rematch-declined" role="status">
                  {rematchDecliners.map((playerId) => room.playerNames[playerId] ?? PLAYER_LABELS[playerId]).join(" and ")} declined the rematch.
                </p>}
                {room.rematchVote && !rematchWasDeclined ? <div className="online-rematch-vote">
                  <strong>{room.playerNames[room.rematchVote.requestedBy] ?? PLAYER_LABELS[room.rematchVote.requestedBy]} requested another game</strong>
                  <p>{room.rematchVote.options.randomizeSeats ? "Randomized player positions" : "Keep current player positions"} · {room.rematchVote.options.dealer === "random" ? "random first dealer" : `${room.playerNames[room.rematchVote.options.dealer] ?? PLAYER_LABELS[room.rematchVote.options.dealer]} deals first`}</p>
                  <div className="online-rematch-vote-list">
                    {game.players.map((player) => <span key={player.id}>
                      {room.playerNames[player.id] ?? PLAYER_LABELS[player.id]} · {room.rematchVote?.votes[player.id] === "accepted" ? "agreed" : "waiting"}
                    </span>)}
                  </div>
                  {room.rematchVote.votes[access.playerId] !== "accepted" ? <div className="online-rematch-vote-actions">
                    <button className="online-primary" type="button" disabled={rematchBusy} onClick={() => void answerRematch("accept")}>Agree</button>
                    <button type="button" disabled={rematchBusy} onClick={() => void answerRematch("decline")}>Decline</button>
                  </div> : <small>Waiting for every player to agree. The next game starts automatically once everyone accepts.</small>}
                </div> : <form onSubmit={(event) => void createRematch(event)}>
                  <label className="online-check">
                    <input type="checkbox" checked={rematchRandomizeSeats} onChange={(event) => setRematchRandomizeSeats(event.target.checked)} />
                    <span>Randomize player positions</span>
                  </label>
                  <p>{ruleset.exchange === "partners" ? "Current teams stay together and remain seated opposite one another." : "This game remains free for all."}</p>
                  <label>
                    <span>First dealer</span>
                    <select value={rematchDealer} onChange={(event) => setRematchDealer(event.target.value as PlayerId | "random")}>
                      <option value="random">Random dealer</option>
                      {game.players.map((player) => <option value={player.id} key={player.id}>{room.playerNames[player.id] ?? PLAYER_LABELS[player.id]} ({player.id})</option>)}
                    </select>
                  </label>
                  <button className="online-primary" type="submit" disabled={rematchBusy}>{rematchBusy ? "Sending request…" : rematchWasDeclined ? "Send a new request" : "Request another game"}</button>
                  <small>Every player must agree before the next game begins.</small>
                </form>}
              </div>
            )}
            {victoryPanel === "statistics" && (
              <div className="online-statistics online-match-statistics">
                <h3>Match overall · {room.matchHistory.length} {room.matchHistory.length === 1 ? "game" : "games"}</h3>
                <div className="online-stat-grid">
                  {matchTotals.map((player) => (
                    <article key={player.participantId}>
                      <strong>{player.playerName}</strong>
                      <span>Games won: {player.gamesWon}</span>
                      <span>Jacks played: {player.jacksPlayed}</span>
                      <span>Out cards (A/K): {player.outCardsPlayed}</span>
                      <span>Pieces eliminated: {player.eliminations}</span>
                      <small>{player.eliminatedPlayers.length
                        ? player.eliminatedPlayers.map((target) => `${target.playerName} ×${target.count}`).join(" · ")
                        : "No opposing pieces eliminated"}</small>
                    </article>
                  ))}
                </div>
                {[...room.matchHistory].reverse().map((matchGame) => {
                  const winners = matchGame.players
                    .filter((player) => matchGame.winnerParticipantIds.includes(player.participantId))
                    .map((player) => player.playerName);
                  return (
                    <section className="online-game-statistics" key={matchGame.gameNumber}>
                      <h3>Game {matchGame.gameNumber} · {winners.join(" and ")} {winners.length > 1 ? "win" : "wins"}</h3>
                      <div className="online-stat-grid">
                        {matchGame.players.map((player) => (
                          <article key={player.participantId}>
                            <strong>{player.playerName}</strong>
                            <span>Jacks played: {player.jacksPlayed}</span>
                            <span>Out cards (A/K): {player.outCardsPlayed}</span>
                            <span>Pieces eliminated: {player.eliminations}</span>
                            <small>{Object.entries(player.eliminatedPlayers).length
                              ? Object.entries(player.eliminatedPlayers).map(([playerId, count]) => {
                                  const target = matchGame.players.find((candidate) => candidate.seatId === playerId);
                                  return `${target?.playerName ?? PLAYER_LABELS[playerId as PlayerId]} ×${count}`;
                                }).join(" · ")
                              : "No opposing pieces eliminated"}</small>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {isDealing && (
          <div className="online-deal-overlay" role="status" aria-live="polite">
            <span className="online-deal-deck" aria-hidden="true"><i /><i /><i /></span>
            <strong>Dealing a new hand…</strong>
          </div>
        )}
        </div>

        <div className="online-hand-stage">
          {localPlayerDock}
        </div>

        <section className="online-play-log" aria-label="Play log">
        <div className="online-log-heading">
          <div>
            <p className="eyebrow">Play log</p>
            <strong>{latestEvent ? "Most recent turns" : "Waiting for the first card"}</strong>
          </div>
          <div className="online-log-actions">
            <button
              type="button"
              className="online-replay-turn"
              disabled={busy || isAnimating || isDealing || Boolean(pendingDealKey) || !canReplayLastTurn}
              onClick={() => void replayLastTurn()}
            >
              {isReplaying ? "Replaying…" : "Replay last turn"}
            </button>
            {latestCard && <PlayingCardGraphic card={latestCard} className="online-log-card" />}
          </div>
        </div>
        <div className="online-log-window">
          {recentEvents.map((event) => (
            <p key={event.revision}>{describePublicGameEvent(event, room.playerNames)}</p>
          ))}
          {recentEvents.length === 0 && <p>Played and discarded cards will appear here for everyone.</p>}
        </div>
        </section>

        <section className="online-deal-summary" aria-label="Upcoming deal information">
          <strong>Next hand: {nextHand.cardsPerPlayer} cards, {room.playerNames[nextHand.starter] ?? PLAYER_LABELS[nextHand.starter]} starts</strong>
          <span>{nextHand.handsRemainingInDeal} {nextHand.handsRemainingInDeal === 1 ? "hand" : "hands"} remaining in this deal</span>
        </section>
      </div>
      {commandError && <p className="online-error" role="alert">{commandError}</p>}
    </section>
  );
}

type MatchTotal = {
  participantId: string;
  playerName: string;
  gamesWon: number;
  jacksPlayed: number;
  outCardsPlayed: number;
  eliminations: number;
  eliminatedPlayers: Array<{ participantId: string; playerName: string; count: number }>;
};

function getMatchTotals(history: readonly MatchGameRecord[]): MatchTotal[] {
  const totals = new Map<string, Omit<MatchTotal, "eliminatedPlayers"> & { eliminated: Map<string, { playerName: string; count: number }> }>();
  for (const game of history) {
    for (const player of game.players) {
      const total = totals.get(player.participantId) ?? {
        participantId: player.participantId,
        playerName: player.playerName,
        gamesWon: 0,
        jacksPlayed: 0,
        outCardsPlayed: 0,
        eliminations: 0,
        eliminated: new Map(),
      };
      total.playerName = player.playerName;
      if (game.winnerParticipantIds.includes(player.participantId)) total.gamesWon += 1;
      total.jacksPlayed += player.jacksPlayed;
      total.outCardsPlayed += player.outCardsPlayed;
      total.eliminations += player.eliminations;
      for (const [seatId, count] of Object.entries(player.eliminatedPlayers)) {
        const target = game.players.find((candidate) => candidate.seatId === seatId);
        if (!target) continue;
        const previous = total.eliminated.get(target.participantId);
        total.eliminated.set(target.participantId, {
          playerName: target.playerName,
          count: (previous?.count ?? 0) + count,
        });
      }
      totals.set(player.participantId, total);
    }
  }
  return [...totals.values()].map(({ eliminated, ...total }) => ({
    ...total,
    eliminatedPlayers: [...eliminated].map(([participantId, result]) => ({ participantId, ...result })),
  }));
}

const ONLINE_HOP_DURATION = 130;
const ONLINE_SWAP_DURATION = 720;
const ONLINE_CARD_PLAY_DURATION = 720;
const ONLINE_CARD_SETTLE_DURATION = 34;
const ONLINE_DEAL_DURATION = 1_050;
const ONLINE_EXCHANGE_RECEIPT_DURATION = 4_200;
const ONLINE_POST_TURN_DEAL_PAUSE = 420;
const ONLINE_REPLAY_RESET_PAUSE = 320;
const ONLINE_REPLAY_END_PAUSE = 240;

function getPresentedCards(events: readonly PublicGameEvent[]): PresentedCard[] {
  const cards: PresentedCard[] = [];
  const currentRoundEvents = getCurrentDealerRoundEvents(events);
  for (let index = currentRoundEvents.length - 1; index >= 0 && cards.length < 2; index -= 1) {
    const event = currentRoundEvents[index];
    if (!event?.card) continue;
    cards.push({ card: event.card, actor: event.actor, key: event.revision });
  }
  return cards;
}

type OnlineAnimationOptions = {
  startingPieces: readonly Piece[];
  moves: readonly AtomicMove[];
  board: ReturnType<typeof getRulesetDefinition>["board"];
  setHoppingPieces: (pieces: HoppingPiece[]) => void;
  setSwappingPieces: (pieces: SwappingPiece[]) => void;
  setCapturingPieceIds: (pieceIds: string[]) => void;
  onPiecesChanged?: (pieces: readonly Piece[]) => void;
  shouldContinue?: () => boolean;
};

async function animateOnlineMoves({
  startingPieces,
  moves,
  board,
  setHoppingPieces,
  setSwappingPieces,
  setCapturingPieceIds,
  onPiecesChanged,
  shouldContinue = () => true,
}: OnlineAnimationOptions): Promise<Piece[]> {
  let currentPieces = [...startingPieces];
  let frameNumber = 0;

  for (const move of moves) {
    if (!shouldContinue()) return currentPieces;
    if (move.kind === "swap") {
      const movingPiece = currentPieces.find((piece) => piece.id === move.pieceId);
      const targetPiece = currentPieces.find((piece) => piece.id === move.targetPieceId);
      if (!movingPiece || !targetPiece) throw new Error("Cannot animate a Jack swap with a missing piece.");

      const movingFrom = getPiecePoint(movingPiece, board);
      const movingTo = getBoardTrackPoint(move.destination.index, board);
      const targetFrom = getPiecePoint(targetPiece, board);
      const targetTo = getBoardTrackPoint(move.targetDestination.index, board);
      setSwappingPieces([
        { piece: movingPiece, from: movingFrom, through: getSwapControlPoint(movingFrom, movingTo), to: movingTo },
        { piece: targetPiece, from: targetFrom, through: getSwapControlPoint(targetFrom, targetTo), to: targetTo },
      ]);
      await waitForOnlineAnimation(ONLINE_SWAP_DURATION);
      if (!shouldContinue()) return currentPieces;
      setSwappingPieces([]);
      currentPieces = applyAtomicMove(currentPieces, move);
      onPiecesChanged?.(currentPieces);
      continue;
    }

    const frames = getMoveAnimationFrames(currentPieces, move, board);
    for (const [frameIndex, frame] of frames.entries()) {
      if (!shouldContinue()) return currentPieces;
      frameNumber += 1;
      if (frameIndex === frames.length - 1 && move.capturedPieceId) {
        setCapturingPieceIds([move.capturedPieceId]);
      }
      setHoppingPieces(frame.flatMap((animated) => {
        const piece = currentPieces.find((candidate) => candidate.id === animated.pieceId);
        return piece ? [{ ...animated, piece, frame: frameNumber }] : [];
      }));
      await waitForOnlineAnimation(ONLINE_HOP_DURATION);
    }
    if (!shouldContinue()) return currentPieces;
    currentPieces = applyAtomicMove(currentPieces, move);
    onPiecesChanged?.(currentPieces);
    setCapturingPieceIds([]);
  }

  return currentPieces;
}

function waitForOnlineAnimation(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

function uniqueOnlineMoves<T extends CardMove>(moves: readonly T[]): T[] {
  const seen = new Set<string>();
  return moves.filter((move) => {
    const key = JSON.stringify(move);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
