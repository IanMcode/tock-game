"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  createOnlineRoom,
  joinOnlineRoom,
  readOnlineRoom,
  sendOnlineChat,
  sendOnlineCommand,
} from "../../src/online/client";
import type { BoardPlayerCount } from "../../src/game/definition";
import type { PlayerId } from "../../src/game/types";
import type { RoomAccess, RoomView } from "../../src/online/roomService";
import { getUnseenAnimationMoves } from "../../src/online/animation";
import { describePublicGameEvent } from "../../src/online/history";
import {
  Board,
  BoardReserve,
  PlayingCardGraphic,
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

const ACCESS_KEY = "tock-online-room-access";
const PLAYER_NAMES: Record<PlayerId, string> = {
  P1: "Poppy",
  P2: "River",
  P3: "Sunny",
  P4: "Fern",
};

export default function OnlineLobby() {
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
    const refresh = async () => {
      try {
        const next = await readOnlineRoom(access.roomId, access.playerToken);
        if (!cancelled) {
          setRoom(next);
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) setError(messageFrom(refreshError));
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [access]);

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
    if (!joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      remember((await joinOnlineRoom(joinCode.trim().toUpperCase(), joinName.trim() || undefined)).access);
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
    setAccess(null);
    setRoom(null);
    setError(null);
  }

  if (access) {
    const isActiveRoom = room?.status === "active";
    const viewerName = room?.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId];
    return (
      <main className={`online-shell ${isActiveRoom ? "online-shell-active" : ""}`}>
        <header className={`online-header ${isActiveRoom ? "online-game-header" : ""}`}>
          <div>
            <p className="eyebrow">Online room{isActiveRoom ? ` · ${access.roomId}` : ""}</p>
            <h1>{isActiveRoom ? `${viewerName} · ${access.playerId}` : access.roomId}</h1>
          </div>
          <div className="online-header-actions">
            {isActiveRoom && (
              <>
                <span>{room?.connectedPlayers.length ?? 0} players connected</span>
                <button type="button" onClick={() => void navigator.clipboard.writeText(access.roomId)}>Copy {access.roomId}</button>
                <button type="button" onClick={leaveRoom}>Leave room</button>
              </>
            )}
            <Link className="quiet-button" href="/">Local table</Link>
          </div>
        </header>

        {!isActiveRoom && <section className="room-card">
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

        {!isActiveRoom && <section className="seat-grid" aria-label="Room seats">
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
          <OnlineRoomTable access={access} room={room} onRoom={setRoom} />
        )}
        {error && <p className="online-error" role="alert">{error}</p>}
        {!isActiveRoom && <button className="leave-room-button" type="button" onClick={leaveRoom}>Forget this room on this tab</button>}
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
            <span>Six-character room code</span>
            <input value={joinCode} maxLength={6} autoCapitalize="characters" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="TOCK42" />
          </label>
          <button className="online-primary" type="button" disabled={busy || !joinCode.trim()} onClick={joinRoom}>Join next open seat</button>
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
}: {
  access: RoomAccess;
  room: RoomView;
  onRoom: (room: RoomView) => void;
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
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const game = room.session.game;
  const ruleset = getRulesetDefinition(game.rulesetId);
  const viewer = game.players.find((player) => player.id === access.playerId);
  const hand = useMemo(() => viewer?.hand ?? [], [viewer]);
  const pieces = useMemo(() => game.players.flatMap((player) => player.pieces), [game.players]);
  const [displayPieces, setDisplayPieces] = useState<Piece[]>(() => [...pieces]);
  const displayPiecesRef = useRef<Piece[]>([...pieces]);
  const displayedRevisionRef = useRef(room.session.revision);
  const locallyAnimatedRevisionRef = useRef<number | null>(null);
  const animationRunRef = useRef(0);
  const selectedCard = selectedCardIndex === null ? null : hand[selectedCardIndex] ?? null;
  const isMyTurn = game.phase === "play" && game.currentPlayer === access.playerId && !game.winningTeam;
  const forcedDiscard = game.forcedDiscardPlayer === access.playerId;
  const dealKey = `${game.dealer}-${game.dealIndex}`;
  const previousDealKey = useRef(dealKey);
  const recentEvents = useMemo(
    () => (room.session.events ?? []).filter((event) => event.type !== "exchange").slice(-ruleset.board.playerCount).reverse(),
    [room.session.events, ruleset.board.playerCount],
  );
  const latestEvent = recentEvents[0];
  const latestCard = latestEvent?.card ?? game.discardPile.at(-1) ?? null;

  useEffect(() => {
    if (previousDealKey.current === dealKey) return;
    previousDealKey.current = dealKey;
    setIsDealing(true);
    const timeout = window.setTimeout(() => setIsDealing(false), ONLINE_DEAL_DURATION);
    return () => window.clearTimeout(timeout);
  }, [dealKey]);

  useEffect(() => {
    const targetRevision = room.session.revision;
    if (targetRevision <= displayedRevisionRef.current) return;

    const previousRevision = displayedRevisionRef.current;
    displayedRevisionRef.current = targetRevision;
    const finalPieces = pieces.map((piece) => ({ ...piece, position: { ...piece.position } }));
    const setVisualPieces = (next: readonly Piece[]) => {
      const copy = next.map((piece) => ({ ...piece, position: { ...piece.position } }));
      displayPiecesRef.current = copy;
      setDisplayPieces(copy);
    };

    if (locallyAnimatedRevisionRef.current === targetRevision) {
      locallyAnimatedRevisionRef.current = null;
      setVisualPieces(finalPieces);
      return;
    }

    const unseenMoves = getUnseenAnimationMoves(
      room.session.events ?? [],
      previousRevision,
      targetRevision,
    );

    if (unseenMoves.length === 0) {
      setVisualPieces(finalPieces);
      return;
    }

    const runId = ++animationRunRef.current;
    setIsAnimating(true);
    setSelectedCardIndex(null);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);

    void animateOnlineMoves({
      startingPieces: displayPiecesRef.current,
      moves: unseenMoves,
      board: ruleset.board,
      setHoppingPieces,
      setSwappingPieces,
      setCapturingPieceIds,
      onPiecesChanged: setVisualPieces,
      shouldContinue: () => animationRunRef.current === runId,
    }).then(() => {
      if (animationRunRef.current !== runId) return;
      setVisualPieces(finalPieces);
      setHoppingPieces([]);
      setSwappingPieces([]);
      setCapturingPieceIds([]);
      setIsAnimating(false);
    }).catch((animationError) => {
      if (animationRunRef.current !== runId) return;
      setVisualPieces(finalPieces);
      setHoppingPieces([]);
      setSwappingPieces([]);
      setCapturingPieceIds([]);
      setIsAnimating(false);
      setCommandError(messageFrom(animationError));
    });
  }, [pieces, room.session.events, room.session.revision, ruleset.board]);
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
  const canDiscard = selectedCardIndex !== null && (
    forcedDiscard || playableIndexes.length === 0 || (onlyFivesPlayable && selectedCard?.rank !== "5")
  );

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
    if (busy || isAnimating || isDealing) return;
    const animationMoves = option.splitSteps ?? [option.move];
    setIsAnimating(true);
    setDestinationMoves([]);

    try {
      const animatedPieces = await animateOnlineMoves({
        startingPieces: isSplitSeven ? previewPieces : displayPiecesRef.current,
        moves: animationMoves,
        board: ruleset.board,
        setHoppingPieces,
        setSwappingPieces,
        setCapturingPieceIds,
      });

      if (isSplitSeven && option.splitSteps) {
        const nextSteps = [...splitSteps, ...option.splitSteps];
        if (nextSteps.length < 7) {
          setSplitSteps(nextSteps);
          setSelectedPieceId(null);
          return;
        }
        const complete = matchingSplitMoves.find((move) =>
          nextSteps.every((step, index) => JSON.stringify(move.steps[index]) === JSON.stringify(step)),
        );
        if (complete) await playMove(complete);
        return;
      }
      displayPiecesRef.current = animatedPieces;
      setDisplayPieces(animatedPieces);
      await playMove(option.move);
    } finally {
      setHoppingPieces([]);
      setSwappingPieces([]);
      setCapturingPieceIds([]);
      setIsAnimating(false);
    }
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
      if (command.type === "play-card") locallyAnimatedRevisionRef.current = next.session.revision;
      onRoom(next);
      resetSelection();
    } catch (submitError) {
      displayPiecesRef.current = [...pieces];
      setDisplayPieces([...pieces]);
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

  const handPanel = (
    <div className="online-hand-panel">
      <div>
        <p className="eyebrow">Your hand</p>
        <strong>{room.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId]}</strong>
      </div>
      <div className="online-hand">
        {hand.map((card, index) => (
          <button
            type="button"
            className={`online-card ${(card.suit === "hearts" || card.suit === "diamonds") ? "red" : ""} ${selectedCardIndex === index ? "is-selected" : ""}`}
            disabled={busy || isDealing || (game.phase === "exchange" ? alreadyExchanged : !isMyTurn)}
            style={{ "--deal-card-index": index } as React.CSSProperties}
            onClick={() => game.phase === "exchange" ? void submit({ type: "select-exchange-card", actor: access.playerId, cardIndex: index }) : chooseCard(index)}
            key={`${card.rank}-${card.suit}-${index}`}
          >
            <span>{card.rank}</span>
            <strong>{cardSymbol(card)}</strong>
          </button>
        ))}
        {hand.length === 0 && <span className="online-empty-hand">No cards remaining</span>}
      </div>
      {game.phase === "exchange" && <p>{alreadyExchanged ? "Card chosen. Waiting for the other players." : "Choose one card to pass to your teammate."}</p>}
      {isMyTurn && game.phase === "play" && (
        <button
          className="online-discard"
          type="button"
          disabled={busy || isDealing || (!canDiscard && !(forcedDiscard && hand.length === 0))}
          onClick={() => void submit({ type: "discard-card", actor: access.playerId, cardIndex: hand.length === 0 ? null : selectedCardIndex })}
        >
          {forcedDiscard ? "Complete forced discard" : "Discard selected card"}
        </button>
      )}
      {selectedCard && isMyTurn && !forcedDiscard && <p>{destinationMoves.length ? "Choose a glowing destination." : "Choose a glowing piece."}</p>}
    </div>
  );
  const localPlayerDock = (
    <div className="online-local-player-dock">
      <BoardReserve
        owner={access.playerId}
        pieces={isSplitSeven ? previewPieces : displayPieces}
        player={boardPlayers.find((player) => player.id === access.playerId)}
        playerName={room.playerNames[access.playerId] ?? PLAYER_NAMES[access.playerId]}
        dealer={game.dealer}
        dealIndex={game.dealIndex}
        dealCount={ruleset.dealSchedule.length}
        activePieceIds={activePieceIds}
        animatedPieceIds={new Set([
          ...hoppingPieces.map((animated) => animated.piece.id),
          ...swappingPieces.map((animated) => animated.piece.id),
        ])}
        selectedPieceId={selectedPieceId}
        capturingPieceIds={capturingPieceIds}
        onPieceClick={choosePiece}
      />
      {handPanel}
    </div>
  );

  return (
    <section className={`online-table ${isAnimating ? "is-animating" : ""} ${isDealing ? "is-dealing" : ""}`} style={{
      ...ONLINE_APPEARANCE,
      "--hop-duration": `${ONLINE_HOP_DURATION}ms`,
      "--swap-duration": `${ONLINE_SWAP_DURATION}ms`,
    } as React.CSSProperties}>
      <div className="online-game-viewport">
        <div className="online-turn-heading">
        <div>
          <p className="eyebrow">Remote table · revision {room.session.revision}</p>
          <h2>{game.winningTeam ? `${room.playerNames[game.winningTeam[0]] ?? PLAYER_NAMES[game.winningTeam[0]]} has won` : game.phase === "exchange" ? "Blind team exchange" : `${room.playerNames[game.currentPlayer] ?? PLAYER_NAMES[game.currentPlayer]}'s turn`}</h2>
        </div>
        {!isMyTurn && game.phase === "play" && !game.winningTeam && <span>Waiting for another player…</span>}
        </div>

        <div className="online-board-stage">
        <Board
          pieces={isSplitSeven ? previewPieces : displayPieces}
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
          selectedPieceId={selectedPieceId}
          destinationMoves={destinationMoves}
          showSpaceNumbers={showNumbers}
          onToggleSpaceNumbers={() => setShowNumbers((shown) => !shown)}
          onPieceClick={choosePiece}
          onDestinationClick={(option) => void chooseDestination(option)}
          recentCard={latestCard}
          perspectivePlayerId={access.playerId}
          externalReservePlayerId={access.playerId}
          footerContent={localPlayerDock}
        />
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
          {latestCard && <PlayingCardGraphic card={latestCard} className="online-log-card" />}
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
  "--color-p1": "#D81B60", "--color-p1-soft": "#F8DCE8", "--color-p1-ink": "#FFFFFF", "--shape-p1": "circle(49% at 50% 50%)",
  "--color-p2": "#0057B8", "--color-p2-soft": "#D9E7F7", "--color-p2-ink": "#FFFFFF", "--shape-p2": "inset(2% round 24%)",
  "--color-p3": "#FFB000", "--color-p3-soft": "#FFF0C2", "--color-p3-ink": "#173D33", "--shape-p3": "polygon(50% 1%, 98% 94%, 2% 94%)",
  "--color-p4": "#00796B", "--color-p4-soft": "#D7ECE8", "--color-p4-ink": "#FFFFFF", "--shape-p4": "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)",
};

const ONLINE_HOP_DURATION = 130;
const ONLINE_SWAP_DURATION = 720;
const ONLINE_DEAL_DURATION = 1_050;

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
