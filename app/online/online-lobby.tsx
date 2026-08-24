"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  createOnlineRoom,
  joinOnlineRoom,
  readOnlineRoom,
  requestRoomRealtimeToken,
  sendOnlineChat,
  sendOnlineCommand,
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
import type { PlayerId } from "../../src/game/types";
import type { RoomAccess, RoomView } from "../../src/online/roomService";
import {
  getCurrentDealerRoundEvents,
  getLatestAnimationTurn,
  getReplayStartingPieces,
  getUnseenAnimationTurns,
} from "../../src/online/animation";
import { describePublicGameEvent } from "../../src/online/history";
import { getGameStatistics } from "../../src/online/statistics";
import {
  Board,
  BoardReserve,
  PlayingCardGraphic,
  SpaceNumberToggle,
  getBoardTrackPoint,
  getPiecePoint,
  getSwapControlPoint,
  type DestinationOption,
  type HoppingPiece,
  type SwappingPiece,
} from "../game-table";
import { applyAtomicMove, applyPieceMove, type AtomicMove } from "../../src/game/actions";
import { getLegalBasicCardMoves } from "../../src/game/cardMoves";
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
const PLAYER_NAMES: Record<PlayerId, string> = {
  P1: "Poppy",
  P2: "River",
  P3: "Sunny",
  P4: "Fern",
};

type OnlineLobbyProps = {
  realtimeEnabled?: boolean;
};

export default function OnlineLobby({ realtimeEnabled = false }: OnlineLobbyProps) {
  const [playerCount, setPlayerCount] = useState<BoardPlayerCount>(4);
  const [teams, setTeams] = useState(true);
  const [dealer, setDealer] = useState<PlayerId | "random">("random");
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roomStatusRef = useRef<RoomView["status"] | null>(null);

  useEffect(() => {
    roomStatusRef.current = room?.status ?? null;
  }, [room?.status]);

  useEffect(() => {
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
  }, []);

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
      if (cancelled || document.visibilityState !== "visible" || roomStatusRef.current === "complete") return;
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
        document.visibilityState !== "visible" ||
        roomStatusRef.current === "complete"
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
      if (cancelled || document.visibilityState !== "visible" || roomStatusRef.current === "complete") return;
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
          setError(null);
          if (next.status === "complete") {
            closeRealtime();
          } else if (!realtimeConnected) {
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
      remember((await createOnlineRoom({
        playerCount,
        teams,
        dealer,
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
      remember((await joinOnlineRoom(joinCode, joinName.trim() || undefined)).access);
    } catch (joinError) {
      setError(messageFrom(joinError));
    } finally {
      setBusy(false);
    }
  }

  function remember(nextAccess: RoomAccess) {
    sessionStorage.setItem(ACCESS_KEY, JSON.stringify(nextAccess));
    setAccess(nextAccess);
  }

  function leaveRoom() {
    sessionStorage.removeItem(ACCESS_KEY);
    roomStatusRef.current = null;
    setAccess(null);
    setRoom(null);
    setError(null);
  }

  if (access) {
    const isGameRoom = room?.status === "active" || room?.status === "complete";
    return (
      <main className={`online-shell ${isGameRoom ? "online-shell-active" : ""}`}>
        {!isGameRoom && <header className="online-header">
          <div>
            <p className="eyebrow">Online room</p>
            <h1>{access.roomId}</h1>
          </div>
          <div className="online-header-actions">
            <Link className="quiet-button" href="/">Local table</Link>
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
            <h2>{room?.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId]} · {access.playerId}</h2>
            <p>{room?.status === "active" ? "The table is ready." : `Waiting for ${Math.max(0, (room?.requiredPlayers ?? 0) - (room?.connectedPlayers.length ?? 0))} more player(s).`}</p>
          </div>
        </section>}

        {!isGameRoom && <section className="seat-grid" aria-label="Room seats">
          {room ? Array.from({ length: room.requiredPlayers }, (_, index) => {
            const playerId = `P${index + 1}` as PlayerId;
            const connected = room.connectedPlayers.includes(playerId);
            return (
              <article className={connected ? "seat-card is-connected" : "seat-card"} key={playerId}>
                <span>{playerId}</span>
                <strong>{room.playerNames[playerId] ?? PLAYER_NAMES[playerId]}</strong>
                <small>{connected ? "Connected" : "Open seat"}</small>
              </article>
            );
          }) : <p>Connecting to room…</p>}
        </section>}

        {room && room.status !== "waiting" && (
          <OnlineRoomTable access={access} room={room} onRoom={setRoom} onAccess={remember} onLeaveRoom={leaveRoom} />
        )}
        {error && <p className="online-error" role="alert">{error}</p>}
        {!isGameRoom && <button className="leave-room-button" type="button" onClick={leaveRoom}>Forget this room on this tab</button>}
      </main>
    );
  }

  const activePlayerIds = (["P1", "P2", "P3", "P4"] as const).slice(0, playerCount);
  return (
    <main className="online-shell">
      <header className="online-header">
        <div>
          <p className="eyebrow">Guest multiplayer</p>
          <h1>Play Tock online</h1>
        </div>
        <Link className="quiet-button" href="/">Local table</Link>
      </header>

      <div className="online-options-grid">
        <section className="online-panel">
          <p className="eyebrow">Host a table</p>
          <h2>Create room</h2>
          <label>
            <span>Your name</span>
            <input value={hostName} maxLength={24} autoComplete="nickname" onChange={(event) => setHostName(event.target.value)} placeholder="Poppy" />
          </label>
          <label>
            <span>Players</span>
            <select value={playerCount} onChange={(event) => {
              const count = Number(event.target.value) as BoardPlayerCount;
              setPlayerCount(count);
              if (count !== 4) setTeams(false);
              if (dealer !== "random" && Number(dealer.slice(1)) > count) setDealer("random");
            }}>
              <option value={2}>2 players</option>
              <option value={3}>3 players</option>
              <option value={4}>4 players</option>
            </select>
          </label>
          <label className="online-check">
            <input type="checkbox" checked={teams} disabled={playerCount !== 4} onChange={(event) => setTeams(event.target.checked)} />
            <span>Opposite-seat teams</span>
          </label>
          <label>
            <span>First dealer</span>
            <select value={dealer} onChange={(event) => setDealer(event.target.value as PlayerId | "random")}>
              <option value="random">Random</option>
              {activePlayerIds.map((playerId) => <option value={playerId} key={playerId}>{PLAYER_NAMES[playerId]}</option>)}
            </select>
          </label>
          <button className="online-primary" type="button" disabled={busy} onClick={createRoom}>Create private room</button>
        </section>

        <section className="online-panel">
          <p className="eyebrow">Have a code?</p>
          <h2>Join room</h2>
          <label>
            <span>Your name</span>
            <input value={joinName} maxLength={24} autoComplete="nickname" onChange={(event) => setJoinName(event.target.value)} placeholder="River" />
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
          <button className="online-primary" type="button" disabled={busy || !/^\d{4}$/.test(joinCode)} onClick={joinRoom}>Join next open seat</button>
          <p className="online-help">Your reconnect token stays in this browser tab. Share only the room code.</p>
        </section>
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
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [victoryPanel, setVictoryPanel] = useState<"rematch" | "statistics" | null>(null);
  const [rematchRandomizeSeats, setRematchRandomizeSeats] = useState(true);
  const [rematchTeams, setRematchTeams] = useState(() => getRulesetDefinition(room.session.game.rulesetId).exchange === "partners");
  const [rematchDealer, setRematchDealer] = useState<PlayerId | "random">("random");
  const [rematchBusy, setRematchBusy] = useState(false);
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
  const forcedDiscard = game.forcedDiscardPlayer === access.playerId;
  const dealKey = `${game.dealer}-${game.dealIndex}`;
  const previousDealKey = useRef(dealKey);
  const previousDealer = useRef(game.dealer);
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
  const gameStatistics = useMemo(
    () => getGameStatistics(room.session.events ?? [], game.players.map((player) => player.id)),
    [game.players, room.session.events],
  );
  const winnerNames = game.winningTeam?.map((playerId) => room.playerNames[playerId] ?? PLAYER_NAMES[playerId]) ?? [];

  useEffect(() => {
    if (previousDealKey.current === dealKey) return;
    const dealerChanged = previousDealer.current !== game.dealer;
    previousDealKey.current = dealKey;
    previousDealer.current = game.dealer;
    setPendingDealKey(dealKey);
    setPendingDealClearsCards(dealerChanged);
  }, [dealKey, game.dealer]);

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
    selectedCard && isMyTurn && !forcedDiscard
      ? getLegalBasicCardMoves(pieces, access.playerId, selectedCard, game.rulesetId)
      : [],
  [access.playerId, forcedDiscard, game.rulesetId, isMyTurn, pieces, selectedCard]);
  const playableIndexes = useMemo(() =>
    !isMyTurn || forcedDiscard ? [] : hand.flatMap((card, index) =>
      getLegalBasicCardMoves(pieces, access.playerId, card, game.rulesetId).length ? [index] : [],
    ),
  [access.playerId, forcedDiscard, game.rulesetId, hand, isMyTurn, pieces]);
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
  const mustDiscardForNoLegalMove = isMyTurn && !forcedDiscard && hand.length > 0 && playableIndexes.length === 0;
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
    setSelectedCardIndex(index);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);
  }

  async function discardCard(index: number | null) {
    if (busy || isAnimating || isDealing || !isMyTurn) return;
    await submit({ type: "discard-card", actor: access.playerId, cardIndex: index });
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

  async function submit(command: GameCommand) {
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
    } finally {
      setBusy(false);
    }
  }

  async function submitChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    setCommandError(null);
    try {
      const next = await sendOnlineChat(access.roomId, access.playerToken, {
        messageId: crypto.randomUUID(),
        text,
      });
      onRoom(next);
      setChatDraft("");
    } catch (chatError) {
      setCommandError(messageFrom(chatError));
    } finally {
      setChatBusy(false);
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
      const next = await createOnlineRoom({
        playerCount: ruleset.board.playerCount,
        teams: ruleset.board.playerCount === 4 && rematchTeams,
        dealer: rematchDealer,
        randomizeSeats: rematchRandomizeSeats,
        playerName: room.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId],
      });
      onRoom(next.room);
      onAccess(next.access);
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
        <strong>{room.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId]}</strong>
      </div>
      {forcedDiscard && <strong className="forced-discard-prompt">10 played · discard one card</strong>}
      <div className="online-hand">
        {hand.map((card, index) => (
          <button
            type="button"
            className={`online-card ${(card.suit === "hearts" || card.suit === "diamonds") ? "red" : ""} ${selectedCardIndex === index ? "is-selected" : ""}`}
            disabled={busy || isDealing || (game.phase === "exchange" ? alreadyExchanged : !isMyTurn)}
            style={{ "--deal-card-index": index } as React.CSSProperties}
            onClick={() => game.phase === "exchange" ? void submit({ type: "select-exchange-card", actor: access.playerId, cardIndex: index }) : chooseCard(index)}
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
            <span>{card.rank}</span>
            <strong>{cardSymbol(card)}</strong>
          </button>
        ))}
        {hand.length === 0 && <span className="online-empty-hand">No cards remaining</span>}
      </div>
      {game.phase === "exchange" && <p>{alreadyExchanged ? "Card chosen. Waiting for the other players." : "Choose one card to pass to your teammate."}</p>}
      {isMyTurn && game.phase === "play" && <div className="online-hand-actions">
        <button className="online-cancel-selection" type="button" disabled={busy || isDealing || !hasSelection} onClick={() => resetSelection()}>
          Cancel selection
        </button>
        <button
          className="online-discard"
          type="button"
          disabled={busy || isDealing || (!canDiscard && !(forcedDiscard && hand.length === 0))}
          onClick={() => discardCard(hand.length === 0 ? null : selectedCardIndex)}
        >
          Discard selected card
        </button>
      </div>}
      {forcedDiscard && hand.length > 0 && <p>Choose a card, then discard—or double-click it.</p>}
      {mustDiscardForNoLegalMove && <p>No legal moves are available. You must discard—double-click a card, or select it and use the discard button.</p>}
      {selectedCard && isMyTurn && !forcedDiscard && !mustDiscardForNoLegalMove && (
        <p>{legalMoves.length === 0
          ? canDiscard
            ? "This card has no legal move and may be discarded—double-click it or use the discard button."
            : "This card has no legal move while another card can be played. Choose a different card."
          : destinationMoves.length ? "Choose a glowing destination." : "Choose a glowing piece."}</p>
      )}
    </div>
  );
  const animatedPieceIds = new Set([
    ...hoppingPieces.map((animated) => animated.piece.id),
    ...swappingPieces.map((animated) => animated.piece.id),
  ]);
  const localPlayerDock = (
    <div className="online-local-player-dock is-hand-only">
      {handPanel}
      <SpaceNumberToggle shown={showNumbers} onToggle={() => setShowNumbers((shown) => !shown)} />
    </div>
  );

  return (
    <section className={`online-table ${isAnimating ? "is-animating" : ""} ${isDealing ? "is-dealing" : ""}`} style={{
      ...ONLINE_APPEARANCE,
      "--hop-duration": `${ONLINE_HOP_DURATION}ms`,
      "--swap-duration": `${ONLINE_SWAP_DURATION}ms`,
    } as React.CSSProperties}>
      <div className="online-game-viewport">
        <div className="online-status-rail has-player-status">
          <div className="online-room-turn-card">
            <div>
              <p className="eyebrow">Online room · {access.roomId} · revision {room.session.revision}</p>
              <h2>{game.winningTeam ? `${room.playerNames[game.winningTeam[0]] ?? PLAYER_NAMES[game.winningTeam[0]]} has won` : game.phase === "exchange" ? "Blind team exchange" : `${room.playerNames[game.currentPlayer] ?? PLAYER_NAMES[game.currentPlayer]}'s turn`}</h2>
              <span>{room.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId]} · {access.playerId} · {room.connectedPlayers.length} connected</span>
              {!isMyTurn && game.phase === "play" && !game.winningTeam && <span>Waiting for another player…</span>}
            </div>
            <div className="online-room-actions">
              <button type="button" onClick={() => void navigator.clipboard.writeText(access.roomId)}>Copy {access.roomId}</button>
              <button type="button" onClick={onLeaveRoom}>Leave</button>
              <Link href="/">Local</Link>
            </div>
          </div>
          <div className="online-player-status-list" aria-label="Players at the table">
            {ruleset.board.playerIds.map((playerId) => (
              <BoardReserve
                key={`${playerId}-status`}
                owner={playerId}
                pieces={renderedPieces}
                player={boardPlayers.find((player) => player.id === playerId)}
                playerName={room.playerNames[playerId] ?? PLAYER_NAMES[playerId]}
                dealer={game.dealer}
                dealIndex={game.dealIndex}
                dealCount={ruleset.dealSchedule.length}
                activePieceIds={activePieceIds}
                animatedPieceIds={animatedPieceIds}
                selectedPieceId={selectedPieceId}
                capturingPieceIds={capturingPieceIds}
                onPieceClick={choosePiece}
                showReservePieces={false}
              />
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
          footerContent={localPlayerDock}
        />
        {game.winningTeam && (
          <section className="online-victory" aria-label="Game complete">
            <p className="eyebrow">Game complete</p>
            <h2>{winnerNames.join(" and ")} Win!</h2>
            <p>{winnerNames.length > 1 ? "Every team piece made it home." : "All four pieces made it home first."}</p>
            <div className="online-victory-actions">
              <button type="button" onClick={() => setVictoryPanel((panel) => panel === "rematch" ? null : "rematch")}>Quickstart a new game</button>
              <button type="button" onClick={() => setVictoryPanel((panel) => panel === "statistics" ? null : "statistics")}>Show game statistics</button>
            </div>
            {victoryPanel === "rematch" && (
              <form className="online-rematch-options" onSubmit={(event) => void createRematch(event)}>
                <label className="online-check">
                  <input type="checkbox" checked={rematchRandomizeSeats} onChange={(event) => setRematchRandomizeSeats(event.target.checked)} />
                  <span>Randomize player positions</span>
                </label>
                {ruleset.board.playerCount === 4 ? (
                  <label>
                    <span>Game format</span>
                    <select value={rematchTeams ? "teams" : "free-for-all"} onChange={(event) => setRematchTeams(event.target.value === "teams")}>
                      <option value="teams">Keep or make opposite-seat teams</option>
                      <option value="free-for-all">Free for all</option>
                    </select>
                  </label>
                ) : <p>This player count will remain free for all.</p>}
                <label>
                  <span>First dealer</span>
                  <select value={rematchDealer} onChange={(event) => setRematchDealer(event.target.value as PlayerId | "random")}>
                    <option value="random">Random dealer</option>
                    {game.players.map((player) => <option value={player.id} key={player.id}>{room.playerNames[player.id] ?? PLAYER_NAMES[player.id]} ({player.id})</option>)}
                  </select>
                </label>
                <button className="online-primary" type="submit" disabled={rematchBusy}>{rematchBusy ? "Creating room…" : "Create rematch room"}</button>
                <small>A fresh room code will be created for the other players to join.</small>
              </form>
            )}
            {victoryPanel === "statistics" && (
              <div className="online-statistics">
                {gameStatistics.map((player) => (
                  <article key={player.playerId}>
                    <strong>{room.playerNames[player.playerId] ?? PLAYER_NAMES[player.playerId]}</strong>
                    <span>Jacks played: {player.jacksPlayed}</span>
                    <span>Out cards (A/K): {player.outCardsPlayed}</span>
                    <span>Pieces eliminated: {player.eliminations}</span>
                    <small>{Object.entries(player.eliminatedPlayers).length
                      ? Object.entries(player.eliminatedPlayers).map(([playerId, count]) => `${room.playerNames[playerId as PlayerId] ?? PLAYER_NAMES[playerId as PlayerId]} ×${count}`).join(" · ")
                      : "No opposing pieces eliminated"}</small>
                  </article>
                ))}
                <p>More detailed statistics can be added as the game history expands.</p>
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

        <section className="online-chat" aria-label="Table chat">
          <div className="online-chat-heading">
            <div>
              <p className="eyebrow">Table chat</p>
              <strong>Players in this room</strong>
            </div>
          </div>
          <div className="online-chat-window" aria-live="polite">
            {room.chatMessages.slice(-12).map((message) => (
              <p key={message.id}>
                <strong>{room.playerNames[message.playerId] ?? PLAYER_NAMES[message.playerId]}</strong>
                <span>{message.text}</span>
              </p>
            ))}
            {room.chatMessages.length === 0 && <p className="online-chat-empty">No messages yet.</p>}
          </div>
          <form className="online-chat-form" onSubmit={(event) => void submitChat(event)}>
            <input
              aria-label="Chat message"
              maxLength={200}
              placeholder="Message the table…"
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
            />
            <button type="submit" disabled={chatBusy || !chatDraft.trim()}>Send</button>
          </form>
        </section>
      </div>
      {commandError && <p className="online-error" role="alert">{commandError}</p>}
    </section>
  );
}

const ONLINE_APPEARANCE = {
  "--color-p1": "#D81B60", "--color-p1-soft": "#F8DCE8", "--color-p1-ink": "#FFFFFF", "--shape-p1": "circle(49% at 50% 50%)", "--pip-offset-p1": "0%",
  "--color-p2": "#0057B8", "--color-p2-soft": "#D9E7F7", "--color-p2-ink": "#FFFFFF", "--shape-p2": "inset(2% round 24%)", "--pip-offset-p2": "0%",
  "--color-p3": "#FFB000", "--color-p3-soft": "#FFF0C2", "--color-p3-ink": "#173D33", "--shape-p3": "polygon(50% 1%, 98% 94%, 2% 94%)", "--pip-offset-p3": "12%",
  "--color-p4": "#00796B", "--color-p4-soft": "#D7ECE8", "--color-p4-ink": "#FFFFFF", "--shape-p4": "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)", "--pip-offset-p4": "0%",
};

const ONLINE_HOP_DURATION = 130;
const ONLINE_SWAP_DURATION = 720;
const ONLINE_CARD_PLAY_DURATION = 720;
const ONLINE_CARD_SETTLE_DURATION = 34;
const ONLINE_DEAL_DURATION = 1_050;
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

function cardSymbol(card: Card): string {
  return { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[card.suit];
}
