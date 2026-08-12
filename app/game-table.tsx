"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { applyAtomicMove, applyPieceMove, type AtomicMove } from "../src/game/actions";
import { getEntryIndex, getHomeEntranceIndex } from "../src/game/board";
import { getLegalBasicCardMoves } from "../src/game/cardMoves";
import { createGame } from "../src/game/createGame";
import {
  getRulesetDefinition,
  type BoardDefinition,
  type BoardPlayerCount,
} from "../src/game/definition";
import { selectExchangeCard } from "../src/game/deals";
import { getAllPieces } from "../src/game/occupancy";
import {
  getMoveAnimationFrames,
  type AnimatedPiecePosition,
} from "../src/game/moveAnimation";
import type { ForwardMove } from "../src/game/moves";
import type { SplitSevenMove } from "../src/game/specialMoves";
import { getSplitSevenDestinationOptions } from "../src/game/splitSelection";
import { getControlledPlayer, getPartner } from "../src/game/teams";
import {
  discardCardForTurn,
  getPlayableCardIndexes,
  playCardForTurn,
  type CardMove,
} from "../src/game/turns";
import {
  PLAYER_IDS,
  type Card,
  type GameState,
  type Piece,
  type PlayerId,
} from "../src/game/types";

const PLAYER_META: Record<
  PlayerId,
  { name: string; team: string }
> = {
  P1: { name: "Poppy", team: "Sun team" },
  P2: { name: "River", team: "Moon team" },
  P3: { name: "Sunny", team: "Sun team" },
  P4: { name: "Fern", team: "Moon team" },
};

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

type MoveChoice = AtomicMove | SplitSevenMove;
export type DestinationOption = {
  move: AtomicMove;
  splitSteps?: ForwardMove[];
};
export type HoppingPiece = AnimatedPiecePosition & {
  piece: Piece;
  frame: number;
};
export type SwappingPiece = {
  piece: Piece;
  from: BoardPoint;
  through: BoardPoint;
  to: BoardPoint;
};
export type BoardPoint = { x: number; y: number };
type AnimationSpeed = "relaxed" | "standard" | "quick" | "off";
type DealerChoice = PlayerId | "random";
type PlayerColorId = "crimson" | "cobalt" | "gold" | "teal" | "violet" | "cyan";
type PlayerShapeId = "circle" | "square" | "triangle" | "hexagon";
type GameSettings = {
  playerCount: BoardPlayerCount;
  teams: boolean;
  startWithPieceOnEntry: boolean;
  showSpaceNumbers: boolean;
  animationSpeed: AnimationSpeed;
  dealer: DealerChoice;
  playerColors: Record<PlayerId, PlayerColorId>;
  playerShapes: Record<PlayerId, PlayerShapeId>;
};
type RecentPlay = {
  actor: string;
  card: Card;
  summary: string;
  verb: "played" | "discarded";
};

const ANIMATION_TIMINGS: Record<AnimationSpeed, { hop: number; swap: number }> = {
  relaxed: { hop: 200, swap: 1_050 },
  standard: { hop: 130, swap: 720 },
  quick: { hop: 75, swap: 420 },
  off: { hop: 0, swap: 0 },
};

const PLAYER_COLORS: Record<PlayerColorId, { label: string; color: string; soft: string; ink: string }> = {
  crimson: { label: "Crimson", color: "#D81B60", soft: "#F8DCE8", ink: "#FFFFFF" },
  cobalt: { label: "Cobalt blue", color: "#0057B8", soft: "#D9E7F7", ink: "#FFFFFF" },
  gold: { label: "Sun gold", color: "#FFB000", soft: "#FFF0C2", ink: "#173D33" },
  teal: { label: "Deep teal", color: "#00796B", soft: "#D7ECE8", ink: "#FFFFFF" },
  violet: { label: "Violet", color: "#7B2CBF", soft: "#EADDF5", ink: "#FFFFFF" },
  cyan: { label: "Bright cyan", color: "#00A6D6", soft: "#D8F1F8", ink: "#173D33" },
};

const PLAYER_COLOR_IDS = Object.keys(PLAYER_COLORS) as PlayerColorId[];

const PLAYER_SHAPES: Record<PlayerShapeId, { label: string; clipPath: string }> = {
  circle: { label: "Circle", clipPath: "circle(49% at 50% 50%)" },
  square: { label: "Rounded square", clipPath: "inset(2% round 24%)" },
  triangle: { label: "Triangle", clipPath: "polygon(50% 1%, 98% 94%, 2% 94%)" },
  hexagon: { label: "Hexagon", clipPath: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)" },
};

const PLAYER_SHAPE_IDS = Object.keys(PLAYER_SHAPES) as PlayerShapeId[];

const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 4,
  teams: true,
  startWithPieceOnEntry: true,
  showSpaceNumbers: true,
  animationSpeed: "standard",
  dealer: "random",
  playerColors: {
    P1: "crimson",
    P2: "cobalt",
    P3: "gold",
    P4: "teal",
  },
  playerShapes: {
    P1: "circle",
    P2: "square",
    P3: "triangle",
    P4: "hexagon",
  },
};

export default function GameTable({ initialGame }: { initialGame: GameState }) {
  const [game, setGame] = useState(initialGame);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [splitSteps, setSplitSteps] = useState<ForwardMove[]>([]);
  const [destinationMoves, setDestinationMoves] = useState<DestinationOption[]>([]);
  const [hoppingPieces, setHoppingPieces] = useState<HoppingPiece[]>([]);
  const [swappingPieces, setSwappingPieces] = useState<SwappingPiece[]>([]);
  const [capturingPieceIds, setCapturingPieceIds] = useState<string[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [setupOpen, setSetupOpen] = useState(false);
  const [showSpaceNumbers, setShowSpaceNumbers] = useState(DEFAULT_SETTINGS.showSpaceNumbers);
  const [recentPlay, setRecentPlay] = useState<RecentPlay | null>(null);
  const [history, setHistory] = useState<string[]>([
    `${PLAYER_META[game.dealer].name} dealt the first hand.`,
  ]);

  const currentPlayer = game.players.find((player) => player.id === game.currentPlayer)!;
  const allPieces = useMemo(() => getAllPieces(game), [game]);
  const playableIndexes = useMemo(() => getPlayableCardIndexes(game), [game]);
  const selectedCard =
    selectedCardIndex === null ? null : currentPlayer.hand[selectedCardIndex] ?? null;
  const forcedDiscard = game.forcedDiscardPlayer === game.currentPlayer;
  const ruleset = getRulesetDefinition(game.rulesetId);
  const boardDefinition = ruleset.board;
  const animationTimings = ANIMATION_TIMINGS[settings.animationSpeed];
  const legalMoves = useMemo(
    () =>
      selectedCard && !forcedDiscard
        ? getLegalBasicCardMoves(allPieces, game.currentPlayer, selectedCard, game.rulesetId)
        : [],
    [allPieces, forcedDiscard, game.currentPlayer, game.rulesetId, selectedCard],
  );
  const isSplitSeven = selectedCard?.rank === "7";
  const previewPieces = useMemo(
    () =>
      splitSteps.reduce<Piece[]>(
        (pieces, step) => applyPieceMove(pieces, step),
        allPieces,
      ),
    [allPieces, splitSteps],
  );
  const matchingSplitMoves = useMemo(() => {
    if (!isSplitSeven) return [];
    return (legalMoves as SplitSevenMove[]).filter((move) =>
      splitSteps.every(
        (step, index) => JSON.stringify(move.steps[index]) === JSON.stringify(step),
      ),
    );
  }, [isSplitSeven, legalMoves, splitSteps]);
  const activePieceIds = useMemo(() => {
    if (!selectedCard || isAnimating) return new Set<string>();
    if (isSplitSeven) {
      return new Set(
        matchingSplitMoves
          .map((move) => move.steps[splitSteps.length]?.pieceId)
          .filter((id): id is string => Boolean(id)),
      );
    }
    return new Set(
      legalMoves
        .filter((move): move is AtomicMove => move.kind !== "split7")
        .map((move) => move.pieceId),
    );
  }, [isAnimating, isSplitSeven, legalMoves, matchingSplitMoves, selectedCard, splitSteps.length]);

  const onlyFivesPlayable =
    playableIndexes.length > 0 &&
    playableIndexes.every((index) => currentPlayer.hand[index]?.rank === "5");
  const selectedCanDiscard =
    selectedCardIndex !== null &&
    (forcedDiscard ||
      playableIndexes.length === 0 ||
      (onlyFivesPlayable && selectedCard?.rank !== "5"));

  function resetSelection() {
    setSelectedCardIndex(null);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);
  }

  function chooseCard(index: number) {
    if (isAnimating) return;
    setSelectedCardIndex(index);
    setSelectedPieceId(null);
    setSplitSteps([]);
    setDestinationMoves([]);
  }

  function commitMove(move: CardMove) {
    if (selectedCardIndex === null || !selectedCard) return;
    const actor = PLAYER_META[game.currentPlayer].name;
    const summary = describeMove(move);
    const next = playCardForTurn(game, selectedCardIndex, move);
    setGame(next);
    setRecentPlay({ actor, card: selectedCard, summary, verb: "played" });
    setHistory((items) => [
      `${actor} played ${selectedCard.rank}${SUIT_SYMBOL[selectedCard.suit]} — ${summary}.`,
      ...items,
    ].slice(0, 12));
    resetSelection();
  }

  function choosePiece(pieceId: string) {
    if (isAnimating || !selectedCard || !activePieceIds.has(pieceId)) return;
    setSelectedPieceId(pieceId);

    if (isSplitSeven) {
      const options = getSplitSevenDestinationOptions(
        matchingSplitMoves,
        splitSteps.length,
        pieceId,
      );
      setDestinationMoves(options.map((option) => ({
        move: option.steps[option.steps.length - 1],
        splitSteps: option.steps,
      })));
      return;
    }

    const matches = legalMoves.filter(
      (move): move is AtomicMove =>
        move.kind !== "split7" && move.pieceId === pieceId,
    );
    setDestinationMoves(uniqueMoves(matches).map((move) => ({ move })));
  }

  function advanceSplit(steps: readonly ForwardMove[]) {
    const nextSteps = [...splitSteps, ...steps];
    if (nextSteps.length === 7) {
      const complete = matchingSplitMoves.find(
        (move) => nextSteps.every(
          (step, index) => JSON.stringify(move.steps[index]) === JSON.stringify(step),
        ),
      );
      if (complete) commitMove(complete);
      return;
    }
    setSplitSteps(nextSteps);
    setSelectedPieceId(null);
    setDestinationMoves([]);
  }

  async function chooseDestination(option: DestinationOption) {
    if (isAnimating) return;

    const animationMoves = option.splitSteps ?? [option.move];
    const animationStart = isSplitSeven ? previewPieces : allPieces;
    setIsAnimating(true);
    setDestinationMoves([]);

    try {
      await animateMoves(animationStart, animationMoves);

      if (isSplitSeven && option.splitSteps) {
        advanceSplit(option.splitSteps);
      } else {
        commitMove(option.move);
      }
    } finally {
      setHoppingPieces([]);
      setSwappingPieces([]);
      setCapturingPieceIds([]);
      setIsAnimating(false);
    }
  }

  async function animateMoves(
    startingPieces: readonly Piece[],
    moves: readonly AtomicMove[],
  ) {
    if (settings.animationSpeed === "off") return;

    let pieces = [...startingPieces];
    let frameNumber = 0;

    for (const move of moves) {
      if (move.kind === "swap") {
        const movingPiece = pieces.find((piece) => piece.id === move.pieceId);
        const targetPiece = pieces.find((piece) => piece.id === move.targetPieceId);

        if (!movingPiece || !targetPiece) {
          throw new Error("Cannot animate a Jack swap with a missing piece.");
        }

        const movingFrom = getPiecePoint(movingPiece, boardDefinition);
        const movingTo = getBoardTrackPoint(move.destination.index, boardDefinition);
        const targetFrom = getPiecePoint(targetPiece, boardDefinition);
        const targetTo = getBoardTrackPoint(move.targetDestination.index, boardDefinition);
        setSwappingPieces([
          {
            piece: movingPiece,
            from: movingFrom,
            through: getSwapControlPoint(movingFrom, movingTo),
            to: movingTo,
          },
          {
            piece: targetPiece,
            from: targetFrom,
            through: getSwapControlPoint(targetFrom, targetTo),
            to: targetTo,
          },
        ]);
        await waitForAnimation(animationTimings.swap);
        setSwappingPieces([]);
        pieces = applyAtomicMove(pieces, move);
        continue;
      }

      const frames = getMoveAnimationFrames(pieces, move, boardDefinition);

      for (const [frameIndex, frame] of frames.entries()) {
        frameNumber += 1;
        if (
          frameIndex === frames.length - 1 &&
          move.capturedPieceId
        ) {
          setCapturingPieceIds([move.capturedPieceId]);
        }
        setHoppingPieces(frame.flatMap((animated) => {
          const piece = pieces.find((candidate) => candidate.id === animated.pieceId);
          return piece ? [{ ...animated, piece, frame: frameNumber }] : [];
        }));
        await waitForAnimation(animationTimings.hop);
      }

      pieces = applyAtomicMove(pieces, move);
      setCapturingPieceIds([]);
    }
  }

  function discardSelected() {
    if (isAnimating || selectedCardIndex === null || !selectedCard) return;
    const actor = PLAYER_META[game.currentPlayer].name;
    const next = discardCardForTurn(game, selectedCardIndex);
    setGame(next);
    setRecentPlay({
      actor,
      card: selectedCard,
      summary: "No piece moved.",
      verb: "discarded",
    });
    setHistory((items) => [
      `${actor} discarded ${selectedCard.rank}${SUIT_SYMBOL[selectedCard.suit]}.`,
      ...items,
    ].slice(0, 12));
    resetSelection();
  }

  function passEmptyForcedTurn() {
    if (isAnimating) return;
    const actor = PLAYER_META[game.currentPlayer].name;
    setGame(discardCardForTurn(game, null));
    setHistory((items) => [`${actor} had no card to discard.`, ...items].slice(0, 12));
    resetSelection();
  }

  function exchangeCard(playerId: PlayerId, index: number) {
    const next = selectExchangeCard(game, playerId, index);
    setGame(next);
    if (next.phase === "play") {
      setHistory((items) => ["Partners exchanged cards. Play begins.", ...items].slice(0, 12));
    }
  }

  function newGame() {
    if (isAnimating) return;
    startNewGame({ ...settings, showSpaceNumbers });
  }

  function startNewGame(nextSettings: GameSettings) {
    const normalizedSettings = normalizeGameSettings(nextSettings);
    const next = createGame({
      playerCount: normalizedSettings.playerCount,
      teams: normalizedSettings.teams,
      startWithPieceOnEntry: normalizedSettings.startWithPieceOnEntry,
      ...(normalizedSettings.dealer === "random" ? {} : { dealer: normalizedSettings.dealer }),
    });
    setSettings(normalizedSettings);
    setDraftSettings(normalizedSettings);
    setShowSpaceNumbers(normalizedSettings.showSpaceNumbers);
    setGame(next);
    setRecentPlay(null);
    setHistory([`${PLAYER_META[next.dealer].name} dealt a new game.`]);
    resetSelection();
    setSetupOpen(false);
  }

  function openSetup() {
    if (isAnimating) return;
    setDraftSettings(normalizeGameSettings({ ...settings, showSpaceNumbers }));
    setSetupOpen(true);
  }

  function chooseDraftColor(playerId: PlayerId, colorId: PlayerColorId) {
    setDraftSettings((current) => {
      const currentColors = current.playerColors ?? DEFAULT_SETTINGS.playerColors;
      const previousColor = currentColors[playerId];
      const otherPlayer = PLAYER_IDS.find(
        (candidate) => candidate !== playerId && currentColors[candidate] === colorId,
      );
      const playerColors = { ...currentColors, [playerId]: colorId };
      if (otherPlayer) playerColors[otherPlayer] = previousColor;
      return { ...current, playerColors };
    });
  }

  function chooseDraftPlayerCount(playerCount: BoardPlayerCount) {
    setDraftSettings((current) => ({
      ...current,
      playerCount,
      teams: playerCount === 4 ? current.teams : false,
      dealer: current.dealer !== "random" && PLAYER_IDS.indexOf(current.dealer) >= playerCount
        ? "random"
        : current.dealer,
    }));
  }

  function chooseDraftShape(playerId: PlayerId, shapeId: PlayerShapeId) {
    setDraftSettings((current) => {
      const currentShapes = current.playerShapes ?? DEFAULT_SETTINGS.playerShapes;
      const previousShape = currentShapes[playerId];
      const otherPlayer = PLAYER_IDS.find(
        (candidate) => candidate !== playerId && currentShapes[candidate] === shapeId,
      );
      const playerShapes = { ...currentShapes, [playerId]: shapeId };
      if (otherPlayer) playerShapes[otherPlayer] = previousShape;
      return { ...current, playerShapes };
    });
  }

  function shuffleDraftAppearances() {
    const colors = shuffleItems(PLAYER_COLOR_IDS).slice(0, PLAYER_IDS.length);
    const shapes = shuffleItems(PLAYER_SHAPE_IDS);
    setDraftSettings((current) => ({
      ...current,
      playerColors: mapPlayerSelections(colors),
      playerShapes: mapPlayerSelections(shapes),
    }));
  }

  const controlledPlayer = getControlledPlayer(allPieces, game.currentPlayer, game.rulesetId);
  const setupPlayerIds = PLAYER_IDS.slice(0, draftSettings.playerCount);

  return (
    <main
      className={`game-shell ${isAnimating ? "is-animating" : ""}`}
      aria-busy={isAnimating}
      style={{
        ...getPlayerAppearanceVariables(settings.playerColors, settings.playerShapes),
        "--hop-duration": `${animationTimings.hop}ms`,
        "--swap-duration": `${animationTimings.swap}ms`,
      } as React.CSSProperties}
    >
      <header className="topbar">
        <div>
          <p className="eyebrow">A local {ruleset.exchange === "partners" ? "partner" : "free-for-all"} game</p>
          <h1>Tock</h1>
        </div>
        <div className="topbar-actions">
          <div className="deal-chip">
            <span>Dealer</span>
            <strong>{PLAYER_META[game.dealer].name}</strong>
            <small>hand {game.dealIndex + 1} of {ruleset.dealSchedule.length}</small>
          </div>
          <Link className="quiet-button" href="/online">Online rooms</Link>
          <button className="quiet-button" disabled={isAnimating} onClick={openSetup}>Game setup</button>
          <button className="quiet-button" disabled={isAnimating} onClick={newGame}>New game</button>
        </div>
      </header>

      {game.winningTeam ? (
        <section
          className="winner-banner"
          style={{
            "--winner-first": playerColorVar(game.winningTeam[0]),
            "--winner-second": playerColorVar(game.winningTeam[1] ?? game.winningTeam[0]),
          } as React.CSSProperties}
        >
          <div className="winner-mark" aria-hidden="true">★</div>
          <div className="winner-copy">
            <span>Game complete</span>
            <h2>{game.winningTeam.length > 1 ? `${PLAYER_META[game.winningTeam[0]].team} wins the table` : `${PLAYER_META[game.winningTeam[0]].name} wins the table`}</h2>
            <p>{game.winningTeam.length > 1 ? `${game.winningTeam.map((playerId) => PLAYER_META[playerId].name).join(" and ")} brought every team piece home.` : `${PLAYER_META[game.winningTeam[0]].name} brought all four pieces home first.`}</p>
          </div>
          <div className="winner-actions">
            <button className="winner-setup" onClick={openSetup}>Game setup</button>
            <button onClick={newGame}>Play again</button>
          </div>
        </section>
      ) : game.phase === "exchange" ? (
        <section className="exchange-banner">
          <div>
            <p className="eyebrow">Blind partner exchange</p>
            <h2>Each player passes one card across the table.</h2>
          </div>
          <p>{Object.keys(game.exchangeSelections).length} of {game.players.length} cards chosen</p>
        </section>
      ) : (
        <section className="turn-banner" style={{ "--player": playerColorVar(game.currentPlayer) } as React.CSSProperties}>
          <span className="turn-dot" />
          <div>
            <p className="eyebrow">Current turn</p>
            <h2>{PLAYER_META[game.currentPlayer].name}</h2>
          </div>
          <p>
            {forcedDiscard
              ? "A 10 was played — choose a card to discard."
              : controlledPlayer !== game.currentPlayer
                ? `All pieces are home. Playing ${PLAYER_META[controlledPlayer].name}’s pieces.`
                : selectedCard
                  ? actionPrompt(selectedCard, splitSteps.length, selectedPieceId !== null)
                  : "Choose a card, then choose a glowing piece."}
          </p>
        </section>
      )}

      <section className="table-layout">
        <Board
          pieces={isSplitSeven ? previewPieces : allPieces}
          boardDefinition={boardDefinition}
          teamMode={ruleset.exchange === "partners"}
          activePieceIds={activePieceIds}
          hoppingPieces={hoppingPieces}
          swappingPieces={swappingPieces}
          capturingPieceIds={capturingPieceIds}
          players={game.players}
          dealer={game.dealer}
          dealIndex={game.dealIndex}
          dealCount={ruleset.dealSchedule.length}
          selectedPieceId={selectedPieceId}
          destinationMoves={destinationMoves}
          showSpaceNumbers={showSpaceNumbers}
          onToggleSpaceNumbers={() => setShowSpaceNumbers((shown) => !shown)}
          onPieceClick={choosePiece}
          onDestinationClick={chooseDestination}
          recentCard={recentPlay?.card}
        />

        <aside className="action-panel">
          <div className="panel-heading">
            <p className="eyebrow">Move desk</p>
            <h2>{selectedCard ? `${selectedCard.rank}${SUIT_SYMBOL[selectedCard.suit]} selected` : "Ready when you are"}</h2>
          </div>

          {destinationMoves.length > 0 ? (
            <div className="helper-card destination-helper">
              <span>◎</span>
              <p>Choose one of the glowing destinations on the board.</p>
            </div>
          ) : selectedCard && legalMoves.length === 0 && !forcedDiscard ? (
            <div className="empty-note">This card has no legal move right now.</div>
          ) : isSplitSeven && splitSteps.length > 0 ? (
            <div className="seven-counter">
              <strong>{splitSteps.length}</strong>
              <span>of 7 steps assigned</span>
              <button disabled={isAnimating} onClick={() => { setSplitSteps([]); setSelectedPieceId(null); setDestinationMoves([]); }}>Start the split again</button>
            </div>
          ) : (
            <div className="helper-card">
              <span>{forcedDiscard ? "10" : selectedCard ? selectedCard.rank : "♟"}</span>
              <p>{forcedDiscard ? "This turn is discard only." : selectedCard ? cardHelp(selectedCard) : "Legal pieces will glow after you choose a card."}</p>
            </div>
          )}

          {forcedDiscard && currentPlayer.hand.length === 0 ? (
            <button className="primary-button" onClick={passEmptyForcedTurn}>Continue</button>
          ) : (
            <button className="discard-button" disabled={isAnimating || !selectedCanDiscard} onClick={discardSelected}>
              {forcedDiscard ? "Discard selected card" : "Discard selected card"}
            </button>
          )}

          <div className="recent-play" aria-live="polite">
            <p className="eyebrow">Most recent card</p>
            {recentPlay ? (
              <div className="recent-play-content">
                <CardFace card={recentPlay.card} className="recent-card" />
                <div>
                  <strong>{recentPlay.actor} {recentPlay.verb}</strong>
                  <span>{recentPlay.summary}</span>
                </div>
              </div>
            ) : (
              <p className="recent-empty">The first played or discarded card will stay here.</p>
            )}
          </div>

          <div className="history">
            <div className="history-heading">
              <p className="eyebrow">Play log</p>
              <span>Newest first</span>
            </div>
            <div className="history-window">
              {history.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
            </div>
          </div>
        </aside>
      </section>

      <section className="players-grid" aria-label="Player hands">
        {game.players.map((player) => {
          const meta = PLAYER_META[player.id];
          const isCurrent = player.id === game.currentPlayer && game.phase === "play";
          const exchangeCardIndex = game.exchangeSelections[player.id];
          const choseExchange = exchangeCardIndex !== undefined;
          const homeCount = player.pieces.filter((piece) => piece.position.zone === "home").length;
          const isHomeComplete = homeCount === player.pieces.length;
          return (
            <article
              className={`player-panel ${isCurrent ? "is-current" : ""} ${isHomeComplete ? "is-home-complete" : ""}`}
              key={player.id}
              style={{ "--player": playerColorVar(player.id), "--player-soft": playerSoftVar(player.id) } as React.CSSProperties}
            >
              <div className="player-heading">
                <div
                  className="player-badge"
                  style={{
                    "--player-shape": playerShapeVar(player.id),
                    "--player-ink": playerInkVar(player.id),
                  } as React.CSSProperties}
                >
                  {player.id.slice(1)}
                </div>
                <div>
                  <h3>{meta.name}</h3>
                  <p>{ruleset.exchange === "partners" ? `${meta.team} · partner ${PLAYER_META[getPartner(player.id, game.rulesetId)].name}` : "Free for all"}</p>
                </div>
                {game.phase === "exchange" ? (
                  <div className={`exchange-status ${choseExchange ? "is-chosen" : ""}`}>
                    {choseExchange ? "Pass chosen ✓" : "Choose 1 card"}
                  </div>
                ) : (
                  <div className="piece-summary">
                    {isHomeComplete ? (
                      <strong>Home complete ✓</strong>
                    ) : (
                      <>
                        <span>{homeCount} home</span>
                        <span>{player.pieces.filter((piece) => piece.position.zone === "reserve").length} reserve</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="hand">
                {player.hand.map((card, index) => {
                  const canExchange = game.phase === "exchange" && !choseExchange;
                  const canSelect = isCurrent && game.phase === "play";
                  const isExchangeSelection = game.phase === "exchange" && exchangeCardIndex === index;
                  const isSelected = (canSelect && selectedCardIndex === index) || isExchangeSelection;
                  const isPlayable = playableIndexes.includes(index);
                  return (
                    <CardButton
                      key={`${card.rank}-${card.suit}-${index}`}
                      card={card}
                      selected={isSelected}
                      exchangeSelected={isExchangeSelection}
                      committing={canSelect && isSelected && isAnimating}
                      playable={canSelect && isPlayable && !forcedDiscard}
                      dimmed={canSelect && !isPlayable && !forcedDiscard && playableIndexes.length > 0}
                      disabled={game.phase === "exchange" ? !canExchange : isAnimating || !canSelect}
                      onClick={() => canExchange ? exchangeCard(player.id, index) : chooseCard(index)}
                    />
                  );
                })}
                {player.hand.length === 0 && <div className="empty-hand">No cards</div>}
              </div>
            </article>
          );
        })}
      </section>

      {setupOpen && (
        <div className="setup-backdrop">
          <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <div className="setup-heading">
              <div>
                <p className="eyebrow">New table</p>
                <h2 id="setup-title">Game setup</h2>
              </div>
              <button className="setup-close" aria-label="Close game setup" onClick={() => setSetupOpen(false)}>×</button>
            </div>

            <div className="setup-options">
              <label className="setup-select">
                <span>
                  <strong>Players</strong>
                  <small>The board and deal schedule adapt to the table size.</small>
                </span>
                <select
                  value={draftSettings.playerCount}
                  onChange={(event) => chooseDraftPlayerCount(Number(event.target.value) as BoardPlayerCount)}
                >
                  <option value={2}>2 players</option>
                  <option value={3}>3 players</option>
                  <option value={4}>4 players</option>
                </select>
              </label>

              <label className="setup-toggle">
                <span>
                  <strong>Opposite-seat teams</strong>
                  <small>{draftSettings.playerCount === 4 ? "Partners exchange cards and win together." : "Team play requires four players."}</small>
                </span>
                <input
                  type="checkbox"
                  checked={draftSettings.teams}
                  disabled={draftSettings.playerCount !== 4}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, teams: event.target.checked }))}
                />
              </label>

              <label className="setup-toggle">
                <span>
                  <strong>Start on protected entry</strong>
                  <small>Place each player’s first piece on space 18.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draftSettings.startWithPieceOnEntry}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, startWithPieceOnEntry: event.target.checked }))}
                />
              </label>
              <label className="setup-toggle">
                <span>
                  <strong>Show space numbers</strong>
                  <small>Display 1–18 in every player section.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draftSettings.showSpaceNumbers}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, showSpaceNumbers: event.target.checked }))}
                />
              </label>

              <label className="setup-select">
                <span>
                  <strong>First dealer</strong>
                  <small>Random remains the default.</small>
                </span>
                <select
                  value={draftSettings.dealer}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, dealer: event.target.value as DealerChoice }))}
                >
                  <option value="random">Random</option>
                  {setupPlayerIds.map((playerId) => <option value={playerId} key={playerId}>{PLAYER_META[playerId].name}</option>)}
                </select>
              </label>

              <fieldset className="motion-options">
                <legend>Movement animation</legend>
                {(["relaxed", "standard", "quick", "off"] as const).map((speed) => (
                  <label key={speed}>
                    <input
                      type="radio"
                      name="animation-speed"
                      value={speed}
                      checked={draftSettings.animationSpeed === speed}
                      onChange={() => setDraftSettings((current) => ({ ...current, animationSpeed: speed }))}
                    />
                    <span>{speed[0].toUpperCase() + speed.slice(1)}</span>
                  </label>
                ))}
              </fieldset>

              <div className="appearance-randomizer">
                <span>
                  <strong>Player appearances</strong>
                  <small>Give every player a unique random color and shape.</small>
                </span>
                <button type="button" onClick={shuffleDraftAppearances}>Shuffle colors &amp; shapes</button>
              </div>

              <fieldset className="setup-colors">
                <legend>Player colors</legend>
                <p>High-contrast palette · selecting a used color swaps it.</p>
                {setupPlayerIds.map((playerId) => (
                  <div className="setup-color-row" key={playerId}>
                    <strong>{PLAYER_META[playerId].name}</strong>
                    <div>
                      {PLAYER_COLOR_IDS.map((colorId) => {
                        const color = PLAYER_COLORS[colorId];
                        const selected = (draftSettings.playerColors ?? DEFAULT_SETTINGS.playerColors)[playerId] === colorId;
                        return (
                          <button
                            type="button"
                            className={selected ? "is-selected" : ""}
                            aria-label={`${PLAYER_META[playerId].name}: ${color.label}`}
                            aria-pressed={selected}
                            title={color.label}
                            key={colorId}
                            style={{ "--swatch": color.color, "--swatch-ink": color.ink } as React.CSSProperties}
                            onClick={() => chooseDraftColor(playerId, colorId)}
                          >
                            <span aria-hidden="true">{selected ? "✓" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>

              <fieldset className="setup-shapes">
                <legend>Player shapes</legend>
                <p>Shapes remain identifiable without color · selecting a used shape swaps it.</p>
                {setupPlayerIds.map((playerId) => (
                  <div className="setup-shape-row" key={playerId}>
                    <strong>{PLAYER_META[playerId].name}</strong>
                    <div>
                      {PLAYER_SHAPE_IDS.map((shapeId) => {
                        const shape = PLAYER_SHAPES[shapeId];
                        const selected = (draftSettings.playerShapes ?? DEFAULT_SETTINGS.playerShapes)[playerId] === shapeId;
                        return (
                          <button
                            type="button"
                            className={selected ? "is-selected" : ""}
                            aria-label={`${PLAYER_META[playerId].name}: ${shape.label}`}
                            aria-pressed={selected}
                            title={shape.label}
                            key={shapeId}
                            style={{
                              "--shape-preview": shape.clipPath,
                              "--shape-color": PLAYER_COLORS[(draftSettings.playerColors ?? DEFAULT_SETTINGS.playerColors)[playerId]].color,
                            } as React.CSSProperties}
                            onClick={() => chooseDraftShape(playerId, shapeId)}
                          >
                            <span aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>
            </div>

            <div className="setup-actions">
              <button className="quiet-button" onClick={() => setSetupOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={() => startNewGame(draftSettings)}>Start new game</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export function BoardReserve({
  owner,
  pieces,
  player,
  playerName,
  dealer,
  dealIndex,
  dealCount,
  activePieceIds,
  animatedPieceIds = new Set<string>(),
  selectedPieceId,
  capturingPieceIds,
  onPieceClick,
  style,
}: {
  owner: PlayerId;
  pieces: readonly Piece[];
  player?: GameState["players"][number];
  playerName: string;
  dealer: PlayerId;
  dealIndex: GameState["dealIndex"];
  dealCount: number;
  activePieceIds: ReadonlySet<string>;
  animatedPieceIds?: ReadonlySet<string>;
  selectedPieceId: string | null;
  capturingPieceIds: readonly string[];
  onPieceClick: (pieceId: string) => void;
  style?: React.CSSProperties;
}) {
  const reservePieces = pieces.filter(
    (piece) => piece.owner === owner && piece.position.zone === "reserve" && !animatedPieceIds.has(piece.id),
  );
  const handCount = player?.hand.length ?? 0;
  const homeComplete = pieces.filter((piece) => piece.owner === owner).every(
    (piece) => piece.position.zone === "home",
  );

  return (
    <div
      className={`board-reserve reserve-${owner.toLowerCase()} ${owner === dealer ? "is-dealer" : ""} ${homeComplete ? "is-home-complete" : ""}`}
      style={{
        "--reserve": playerColorVar(owner),
        "--reserve-soft": playerSoftVar(owner),
        ...style,
      } as React.CSSProperties}
      aria-label={`${playerName}'s reserve`}
    >
      <div className="reserve-heading">
        <span className="reserve-player-label">
          <i style={{ "--player-shape": playerShapeVar(owner) } as React.CSSProperties} aria-hidden="true" />
          {playerName}
        </span>
        {owner === dealer && (
          <span className="board-dealer" aria-label={`${playerName} is the dealer, hand ${dealIndex + 1} of ${dealCount}`}>
            <DeckIcon />
            <span>
              <strong>Dealer</strong>
              <small>Hand {dealIndex + 1} of {dealCount}</small>
            </span>
          </span>
        )}
      </div>
      <div className="board-hand-count" aria-label={`${playerName} has ${handCount} ${handCount === 1 ? "card" : "cards"} remaining`}>
        {handCount > 0 ? (
          <span className="face-down-cards" aria-hidden="true">
            {Array.from({ length: handCount }, (_, index) => <i key={index} />)}
          </span>
        ) : (
          <span className="empty-card-count">No cards</span>
        )}
        <small>{handCount} left</small>
      </div>
      <div className="reserve-pieces">
        {reservePieces.length > 0 ? reservePieces.map((piece) => (
          <PieceButton
            key={piece.id}
            piece={piece}
            active={activePieceIds.has(piece.id)}
            selected={selectedPieceId === piece.id}
            capturing={capturingPieceIds.includes(piece.id)}
            playerName={playerName}
            onClick={() => onPieceClick(piece.id)}
          />
        )) : <small>{homeComplete ? "Home complete ✓" : "All in play"}</small>}
      </div>
    </div>
  );
}

export function Board({
  pieces,
  boardDefinition,
  teamMode,
  activePieceIds,
  hoppingPieces,
  swappingPieces,
  capturingPieceIds,
  players,
  playerNames,
  dealer,
  dealIndex,
  dealCount,
  selectedPieceId,
  destinationMoves,
  showSpaceNumbers,
  onToggleSpaceNumbers,
  onPieceClick,
  onDestinationClick,
  recentCard,
  perspectivePlayerId,
  externalReservePlayerId,
  footerContent,
}: {
  pieces: readonly Piece[];
  boardDefinition: BoardDefinition;
  teamMode: boolean;
  activePieceIds: ReadonlySet<string>;
  hoppingPieces: readonly HoppingPiece[];
  swappingPieces: readonly SwappingPiece[];
  capturingPieceIds: readonly string[];
  players: GameState["players"];
  playerNames?: Partial<Record<PlayerId, string>>;
  dealer: PlayerId;
  dealIndex: GameState["dealIndex"];
  dealCount: number;
  selectedPieceId: string | null;
  destinationMoves: readonly DestinationOption[];
  showSpaceNumbers: boolean;
  onToggleSpaceNumbers: () => void;
  onPieceClick: (pieceId: string) => void;
  onDestinationClick: (option: DestinationOption) => void;
  recentCard?: Card | null;
  perspectivePlayerId?: PlayerId;
  externalReservePlayerId?: PlayerId;
  footerContent?: React.ReactNode;
}) {
  const animatedPieceIds = new Set([
    ...hoppingPieces.map((animated) => animated.piece.id),
    ...swappingPieces.map((animated) => animated.piece.id),
  ]);
  const destinationColor = selectedPieceId
    ? playerColorVar(pieces.find((piece) => piece.id === selectedPieceId)?.owner ?? "P1")
    : playerColorVar("P1");
  const destinationShape = selectedPieceId
    ? playerShapeVar(pieces.find((piece) => piece.id === selectedPieceId)?.owner ?? "P1")
    : playerShapeVar("P1");
  const activePlayerIds = boardDefinition.playerIds;
  const perspectiveRotation = perspectivePlayerId
    ? getBoardPerspectiveRotation(perspectivePlayerId, boardDefinition)
    : 0;

  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <div>
          <p className="eyebrow">The playing board</p>
          <span>{boardDefinition.trackSize} track spaces · {boardDefinition.playerCount} home lanes</span>
        </div>
        <button
          className="number-toggle"
          type="button"
          aria-pressed={showSpaceNumbers}
          onClick={onToggleSpaceNumbers}
        >
          <i aria-hidden="true"><span /></i>
          Space numbers
        </button>
      </div>
      <div
        className={`board board-${boardDefinition.playerCount}`}
        aria-label={`${boardDefinition.trackSize}-space Tock board`}
        style={{
          "--board-rotation": `${perspectiveRotation}deg`,
          "--counter-rotation": `${-perspectiveRotation}deg`,
        } as React.CSSProperties}
      >
        <div className={`board-center ${recentCard ? "has-recent-card" : ""}`}>
          {recentCard ? (
            <PlayingCardGraphic card={recentCard} />
          ) : (
            <>
              <span>TOCK</span>
              <small>{teamMode ? "partners across" : "race home"}</small>
            </>
          )}
        </div>
        {activePlayerIds.map((owner) => {
          if (owner === externalReservePlayerId) return null;
          const playerName = playerNames?.[owner] ?? PLAYER_META[owner].name;
          const reservePoint = getBoardReservePoint(owner, boardDefinition, perspectivePlayerId);
          return (
            <BoardReserve
              key={`${owner}-reserve`}
              owner={owner}
              pieces={pieces}
              player={players.find((player) => player.id === owner)}
              playerName={playerName}
              dealer={dealer}
              dealIndex={dealIndex}
              dealCount={dealCount}
              activePieceIds={activePieceIds}
              animatedPieceIds={animatedPieceIds}
              selectedPieceId={selectedPieceId}
              capturingPieceIds={capturingPieceIds}
              onPieceClick={onPieceClick}
              style={{ left: `${reservePoint.x}%`, top: `${reservePoint.y}%` }}
            />
          );
        })}
        {Array.from({ length: boardDefinition.trackSize }, (_, index) => {
          const point = getBoardTrackPoint(index, boardDefinition);
          const occupant = pieces.find(
            (piece) =>
              piece.position.zone === "track" &&
              piece.position.index === index &&
              !animatedPieceIds.has(piece.id),
          );
          const owner = activePlayerIds[Math.floor(index / boardDefinition.sectionSize)];
          const entryOwner = activePlayerIds.find((id) => getEntryIndex(id, boardDefinition) === index);
          const destinationMove = destinationMoves.find(
            (option) => option.move.destination.zone === "track" && option.move.destination.index === index,
          );
          return (
            <div
              className={`track-space ${entryOwner ? "entry-space" : ""} ${destinationMove ? "possible-destination" : ""}`}
              key={index}
              style={{ left: `${point.x}%`, top: `${point.y}%`, "--section": playerSoftVar(owner), "--entry": entryOwner ? playerColorVar(entryOwner) : undefined, "--destination": destinationColor, "--destination-shape": destinationShape } as React.CSSProperties}
            >
              <span className="space-number" aria-hidden="true">
                {showSpaceNumbers ? index % 18 + 1 : ""}
              </span>
              {occupant && (
                <PieceButton
                  piece={occupant}
                  active={activePieceIds.has(occupant.id)}
                  selected={selectedPieceId === occupant.id}
                  capturing={capturingPieceIds.includes(occupant.id)}
                  playerName={playerNames?.[occupant.owner]}
                  onClick={() => onPieceClick(occupant.id)}
                />
              )}
              {destinationMove && (
                <DestinationButton
                  option={destinationMove}
                  onClick={() => onDestinationClick(destinationMove)}
                />
              )}
            </div>
          );
        })}
        {activePlayerIds.flatMap((owner) => {
          return Array.from({ length: boardDefinition.homeSize }, (_, index) => {
            const point = getHomeLanePoint(owner, index, boardDefinition);
            const occupant = pieces.find(
              (piece) =>
                piece.owner === owner &&
                piece.position.zone === "home" &&
                piece.position.index === index &&
                !animatedPieceIds.has(piece.id),
            );
            const destinationMove = destinationMoves.find(
              (option) =>
                option.move.destination.zone === "home" &&
                option.move.destination.index === index &&
                pieces.find((piece) => piece.id === option.move.pieceId)?.owner === owner,
            );
            return (
              <div
                className={`home-space ${destinationMove ? "possible-destination" : ""}`}
                key={`${owner}-home-${index}`}
                style={{ left: `${point.x}%`, top: `${point.y}%`, "--home": playerSoftVar(owner), "--destination": destinationColor, "--destination-shape": destinationShape } as React.CSSProperties}
              >
                {occupant && (
                  <PieceButton
                    piece={occupant}
                    active={activePieceIds.has(occupant.id)}
                    selected={selectedPieceId === occupant.id}
                    capturing={capturingPieceIds.includes(occupant.id)}
                    playerName={playerNames?.[occupant.owner]}
                    onClick={() => onPieceClick(occupant.id)}
                  />
                )}
                {destinationMove && (
                  <DestinationButton
                    option={destinationMove}
                    onClick={() => onDestinationClick(destinationMove)}
                  />
                )}
              </div>
            );
          });
        })}
        {hoppingPieces.map((animated) => {
          const point = animated.position.zone === "track"
            ? getBoardTrackPoint(animated.position.index, boardDefinition)
            : getHomeLanePoint(animated.piece.owner, animated.position.index, boardDefinition);
          const animatedPiece = { ...animated.piece, position: animated.position };

          return (
            <div
              className={`hopping-piece-slot ${animated.position.zone === "home" ? "is-home" : "is-track"}`}
              key={`${animated.piece.id}-${animated.frame}`}
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                position: "absolute",
                zIndex: 10,
                width: `${getBoardSpaceSize(boardDefinition)}%`,
                aspectRatio: "1",
                transform: "translate(-50%,-50%)",
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            >
              <PieceButton
                piece={animatedPiece}
                active={false}
                selected={false}
                hopping
                playerName={playerNames?.[animated.piece.owner]}
                onClick={() => undefined}
              />
            </div>
          );
        })}
        {swappingPieces.map((animated) => (
          <div
            className="swapping-piece-slot"
            key={`swap-${animated.piece.id}`}
            style={{
              "--swap-from-x": `${animated.from.x}%`,
              "--swap-from-y": `${animated.from.y}%`,
              "--swap-through-x": `${animated.through.x}%`,
              "--swap-through-y": `${animated.through.y}%`,
              "--swap-to-x": `${animated.to.x}%`,
              "--swap-to-y": `${animated.to.y}%`,
            } as React.CSSProperties}
            aria-hidden="true"
          >
            <PieceButton
              piece={animated.piece}
              active={false}
              selected={false}
              hopping
              playerName={playerNames?.[animated.piece.owner]}
              onClick={() => undefined}
            />
          </div>
        ))}
      </div>
      {footerContent && <div className="board-footer-dock">{footerContent}</div>}
      <div className="team-key">
        {teamMode ? (
          <>
            <span>
              <i style={{ background: playerColorVar("P1"), "--player-shape": playerShapeVar("P1") } as React.CSSProperties} />
              <i style={{ background: playerColorVar("P3"), "--player-shape": playerShapeVar("P3") } as React.CSSProperties} />
              {(playerNames?.P1 ?? PLAYER_META.P1.name)} + {(playerNames?.P3 ?? PLAYER_META.P3.name)}
            </span>
            <span>
              <i style={{ background: playerColorVar("P2"), "--player-shape": playerShapeVar("P2") } as React.CSSProperties} />
              <i style={{ background: playerColorVar("P4"), "--player-shape": playerShapeVar("P4") } as React.CSSProperties} />
              {(playerNames?.P2 ?? PLAYER_META.P2.name)} + {(playerNames?.P4 ?? PLAYER_META.P4.name)}
            </span>
          </>
        ) : activePlayerIds.map((playerId) => (
          <span key={playerId}>
            <i style={{ background: playerColorVar(playerId), "--player-shape": playerShapeVar(playerId) } as React.CSSProperties} />
            {playerNames?.[playerId] ?? PLAYER_META[playerId].name}
          </span>
        ))}
        <span className="protection-key"><b>✦</b> Protected entry</span>
      </div>
    </div>
  );
}

function CardButton({ card, selected, exchangeSelected, committing, playable, dimmed, disabled, onClick }: {
  card: Card;
  selected: boolean;
  exchangeSelected: boolean;
  committing: boolean;
  playable: boolean;
  dimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      className={`playing-card ${red ? "red" : "black"} ${selected ? "selected" : ""} ${exchangeSelected ? "exchange-selected" : ""} ${committing ? "is-committing" : ""} ${playable ? "playable" : ""} ${dimmed ? "dimmed" : ""}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={`${card.rank} of ${card.suit}`}
      aria-pressed={selected}
    >
      <CardFace card={card} />
    </button>
  );
}

export function CardFace({ card, className = "" }: { card: Card; className?: string }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span className={`card-face ${red ? "red" : "black"} ${className}`}>
      <span>{card.rank}</span>
      <strong>{SUIT_SYMBOL[card.suit]}</strong>
      <small>{card.rank}</small>
    </span>
  );
}

export function PlayingCardGraphic({ card, className = "" }: { card: Card; className?: string }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const suit = SUIT_SYMBOL[card.suit];
  return (
    <span className={`table-card ${red ? "red" : "black"} ${className}`} aria-label={`${card.rank} of ${card.suit}`}>
      <span className="table-card-corner table-card-top"><b>{card.rank}</b><i>{suit}</i></span>
      <strong aria-hidden="true">{suit}</strong>
      <span className="table-card-corner table-card-bottom"><b>{card.rank}</b><i>{suit}</i></span>
    </span>
  );
}

function DeckIcon() {
  return (
    <span className="deck-icon" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function PieceButton({ piece, active, selected, capturing = false, hopping = false, playerName, onClick }: {
  piece: Piece;
  active: boolean;
  selected: boolean;
  capturing?: boolean;
  hopping?: boolean;
  playerName?: string;
  onClick: () => void;
}) {
  const pieceNumber = Number(piece.id.split("-")[1]);

  return (
    <button
      className={`piece ${active ? "active" : ""} ${selected ? "selected" : ""} ${capturing ? "is-captured" : ""} ${hopping ? "is-hopping" : ""} ${piece.position.zone === "track" && piece.position.isEntryProtected ? "protected" : ""}`}
      style={{
        "--piece": playerColorVar(piece.owner),
        "--piece-ink": playerInkVar(piece.owner),
        "--piece-shape": playerShapeVar(piece.owner),
      } as React.CSSProperties}
      onClick={() => {
        if (active) onClick();
      }}
      aria-disabled={!active}
      tabIndex={active ? 0 : -1}
      aria-label={`${playerName ?? PLAYER_META[piece.owner].name} piece ${pieceNumber}${piece.position.zone === "track" && piece.position.isEntryProtected ? ", protected entry" : ""}`}
    >
      <span className="piece-shape" aria-hidden="true" />
      <span className={`piece-pips pips-${pieceNumber}`} aria-hidden="true">
        {Array.from({ length: pieceNumber }, (_, index) => <i key={index} />)}
      </span>
    </button>
  );
}

function DestinationButton({ option, onClick }: {
  option: DestinationOption;
  onClick: () => void;
}) {
  return (
    <button
      className="destination-button"
      type="button"
      aria-label={`Choose destination: ${describeDestinationOption(option)}`}
      onClick={onClick}
    >
      <span aria-hidden="true" />
    </button>
  );
}

function describeDestinationOption(option: DestinationOption) {
  if (option.splitSteps && option.splitSteps.length > 1) {
    const destination = option.move.destination.zone === "home"
      ? `home ${option.move.destination.index + 1}`
      : `track ${option.move.destination.index + 1}`;
    return `move ${shortPiece(option.move.pieceId)} ${option.splitSteps.length} spaces to ${destination}`;
  }

  return describeMove(option.move);
}

export function getBoardTrackPoint(trackIndex: number, board: BoardDefinition): BoardPoint {
  if (board.playerCount === 2) return getTwoPlayerTrackPoint(trackIndex, board);
  if (board.playerCount === 3) return getThreePlayerTrackPoint(trackIndex, board);
  const vertices = getBoardVertices(board.playerCount);
  const edgeProgress = getBoardEdgeProgress(trackIndex, board, vertices.length);
  const edgeIndex = Math.floor(edgeProgress) % vertices.length;
  const edgeOffset = edgeProgress - Math.floor(edgeProgress);
  const from = vertices[edgeIndex];
  const to = vertices[(edgeIndex + 1) % vertices.length];
  return roundPoint({
    x: from.x + (to.x - from.x) * edgeOffset,
    y: from.y + (to.y - from.y) * edgeOffset,
  });
}

export function getHomeLanePoint(owner: PlayerId, homeIndex: number, board: BoardDefinition) {
  const gate = getBoardTrackPoint(getHomeEntranceIndex(owner, board), board);
  const direction = getInwardTrackNormal(getHomeEntranceIndex(owner, board), board, gate);
  const distance = getBoardSpaceSize(board) * (homeIndex + 1);
  return roundPoint({
    x: gate.x + direction.x * distance,
    y: gate.y + direction.y * distance,
  });
}

function getInwardTrackNormal(trackIndex: number, board: BoardDefinition, point: BoardPoint): BoardPoint {
  if (board.playerCount === 2) {
    const normalizedIndex = (trackIndex + board.trackSize) % board.trackSize;
    if (normalizedIndex <= 10) return { x: -1, y: 0 };
    if (normalizedIndex <= 17) return { x: 0, y: -1 };
    if (normalizedIndex <= 28) return { x: 1, y: 0 };
    return { x: 0, y: 1 };
  }
  if (board.playerCount === 3) {
    const normalizedIndex = (trackIndex + board.trackSize) % board.trackSize;
    const playerIndex = Math.floor(normalizedIndex / board.sectionSize);
    const seatStart = getThreePlayerSeatPoint(playerIndex, "start");
    const seatEnd = getThreePlayerSeatPoint(playerIndex, "end");
    const dx = seatEnd.x - seatStart.x;
    const dy = seatEnd.y - seatStart.y;
    const length = Math.hypot(dx, dy) || 1;
    let normal = { x: -dy / length, y: dx / length };
    const towardCenter = { x: 50 - point.x, y: 50 - point.y };
    if (normal.x * towardCenter.x + normal.y * towardCenter.y < 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    return normal;
  }
  const vertices = getBoardVertices(board.playerCount);
  const edgeProgress = getBoardEdgeProgress(trackIndex, board, vertices.length);
  const edgeIndex = Math.floor(edgeProgress) % vertices.length;
  const from = vertices[edgeIndex];
  const to = vertices[(edgeIndex + 1) % vertices.length];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  let normal = { x: -dy / length, y: dx / length };
  const towardCenter = { x: 50 - point.x, y: 50 - point.y };
  if (normal.x * towardCenter.x + normal.y * towardCenter.y < 0) {
    normal = { x: -normal.x, y: -normal.y };
  }
  return normal;
}

function getBoardSpaceSize(board: BoardDefinition): number {
  if (board.playerCount === 2) return 6;
  if (board.playerCount === 3) return 4;
  return 3.3;
}

function getTwoPlayerTrackPoint(trackIndex: number, board: BoardDefinition): BoardPoint {
  const index = (trackIndex + board.trackSize) % board.trackSize;
  const left = 22;
  const right = 78;
  const top = 10;
  const bottom = 90;

  if (index <= 10) {
    return roundPoint({ x: right, y: top + (index + 1) / 12 * (bottom - top) });
  }
  if (index <= 17) {
    return roundPoint({ x: right - (index - 11) / 6 * (right - left), y: bottom });
  }
  if (index <= 28) {
    return roundPoint({ x: left, y: bottom - (index - 17) / 12 * (bottom - top) });
  }
  return roundPoint({ x: left + (index - 29) / 6 * (right - left), y: top });
}

function getThreePlayerTrackPoint(trackIndex: number, board: BoardDefinition): BoardPoint {
  const normalizedIndex = (trackIndex + board.trackSize) % board.trackSize;
  const playerIndex = Math.floor(normalizedIndex / board.sectionSize);
  const sectionSpace = normalizedIndex % board.sectionSize + 1;
  const seatStart = getThreePlayerSeatPoint(playerIndex, "start");
  const seatEnd = getThreePlayerSeatPoint(playerIndex, "end");

  if (sectionSpace >= 12) {
    const progress = (sectionSpace - 12) / 6;
    return roundPoint({
      x: seatStart.x + (seatEnd.x - seatStart.x) * progress,
      y: seatStart.y + (seatEnd.y - seatStart.y) * progress,
    });
  }

  const previousSeatEnd = getThreePlayerSeatPoint((playerIndex + 2) % 3, "end");
  const progress = sectionSpace / 12;
  return roundPoint({
    x: previousSeatEnd.x + (seatStart.x - previousSeatEnd.x) * progress,
    y: previousSeatEnd.y + (seatStart.y - previousSeatEnd.y) * progress,
  });
}

function getThreePlayerSeatPoint(playerIndex: number, endpoint: "start" | "end"): BoardPoint {
  const seatHalfWidth = 8 * Math.sqrt(3);
  const base = endpoint === "start"
    ? { x: 50 + seatHalfWidth, y: 90 }
    : { x: 50 - seatHalfWidth, y: 90 };
  const radians = playerIndex * 2 * Math.PI / 3;
  const x = base.x - 50;
  const y = base.y - 50;
  return roundPoint({
    x: 50 + x * Math.cos(radians) - y * Math.sin(radians),
    y: 50 + x * Math.sin(radians) + y * Math.cos(radians),
  });
}

export function getBoardReservePoint(
  owner: PlayerId,
  board: BoardDefinition,
  perspectivePlayerId?: PlayerId,
): BoardPoint {
  if (board.playerCount === 3 && perspectivePlayerId && owner !== perspectivePlayerId) {
    const viewerIndex = board.playerIds.indexOf(perspectivePlayerId);
    const ownerIndex = board.playerIds.indexOf(owner);
    const relativeSeat = (ownerIndex - viewerIndex + board.playerCount) % board.playerCount;
    const screenPoint = relativeSeat === 1 ? { x: 19, y: 8 } : { x: 81, y: 8 };
    return rotateBoardPoint(screenPoint, -getBoardPerspectiveRotation(perspectivePlayerId, board));
  }

  const entryIndex = getEntryIndex(owner, board);
  const entry = getBoardTrackPoint(entryIndex, board);
  if (board.playerCount === 2) {
    return { x: entry.x, y: entry.y < 50 ? -14 : 114 };
  }
  const inward = getInwardTrackNormal(entryIndex, board, entry);
  const outward = { x: -inward.x, y: -inward.y };
  const fromCenter = { x: entry.x - 50, y: entry.y - 50 };
  const reserveRadius = board.playerCount === 3 ? 64 : 44;
  const perpendicularDistance = fromCenter.x * outward.x + fromCenter.y * outward.y;
  const outwardOffset = reserveRadius - perpendicularDistance;
  return roundPoint({
    x: entry.x + outward.x * outwardOffset,
    y: entry.y + outward.y * outwardOffset,
  });
}

function rotateBoardPoint(point: BoardPoint, degrees: number): BoardPoint {
  const radians = degrees * Math.PI / 180;
  const x = point.x - 50;
  const y = point.y - 50;
  return roundPoint({
    x: 50 + x * Math.cos(radians) - y * Math.sin(radians),
    y: 50 + x * Math.sin(radians) + y * Math.cos(radians),
  });
}

export function getBoardPerspectiveRotation(viewer: PlayerId, board: BoardDefinition): number {
  const entryIndex = getEntryIndex(viewer, board);
  const entry = getBoardTrackPoint(entryIndex, board);
  const inward = getInwardTrackNormal(entryIndex, board, entry);
  const currentAngle = Math.atan2(-inward.y, -inward.x) * 180 / Math.PI;
  const rotation = 90 - currentAngle;
  return rotation > 180 ? rotation - 360 : rotation;
}

function getBoardEdgeProgress(
  trackIndex: number,
  board: BoardDefinition,
  edgeCount: number,
): number {
  const perspectiveOffset = -11;
  const shiftedIndex = (trackIndex + perspectiveOffset + board.trackSize) % board.trackSize;
  return shiftedIndex / board.trackSize * edgeCount;
}

function getBoardVertices(playerCount: BoardPlayerCount): readonly BoardPoint[] {
  if (playerCount === 2) {
    return [{ x: 22, y: 10 }, { x: 78, y: 10 }, { x: 78, y: 90 }, { x: 22, y: 90 }];
  }
  if (playerCount === 3) {
    return [{ x: 63.8564, y: 90 }, { x: 36.1436, y: 90 }, { x: 8.4308, y: 42 }];
  }
  return [{ x: 18, y: 16 }, { x: 82, y: 16 }, { x: 84, y: 84 }, { x: 16, y: 84 }];
}

function roundPoint(point: { x: number; y: number }) {
  return {
    x: Number(point.x.toFixed(4)),
    y: Number(point.y.toFixed(4)),
  };
}

function playerColorVar(playerId: PlayerId) {
  return `var(--color-${playerId.toLowerCase()})`;
}

function playerSoftVar(playerId: PlayerId) {
  return `var(--color-${playerId.toLowerCase()}-soft)`;
}

function playerInkVar(playerId: PlayerId) {
  return `var(--color-${playerId.toLowerCase()}-ink)`;
}

function playerShapeVar(playerId: PlayerId) {
  return `var(--shape-${playerId.toLowerCase()})`;
}

function getPlayerAppearanceVariables(
  selections: Record<PlayerId, PlayerColorId> | undefined,
  shapes: Record<PlayerId, PlayerShapeId> | undefined,
): React.CSSProperties {
  return PLAYER_IDS.reduce<Record<string, string>>((variables, playerId) => {
    const color = PLAYER_COLORS[selections?.[playerId] ?? DEFAULT_SETTINGS.playerColors[playerId]];
    const shape = PLAYER_SHAPES[shapes?.[playerId] ?? DEFAULT_SETTINGS.playerShapes[playerId]];
    variables[`--color-${playerId.toLowerCase()}`] = color.color;
    variables[`--color-${playerId.toLowerCase()}-soft`] = color.soft;
    variables[`--color-${playerId.toLowerCase()}-ink`] = color.ink;
    variables[`--shape-${playerId.toLowerCase()}`] = shape.clipPath;
    return variables;
  }, {}) as React.CSSProperties;
}

function shuffleItems<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function mapPlayerSelections<T>(values: readonly T[]): Record<PlayerId, T> {
  return Object.fromEntries(
    PLAYER_IDS.map((playerId, index) => [playerId, values[index]]),
  ) as Record<PlayerId, T>;
}

function normalizeGameSettings(settings: GameSettings): GameSettings {
  const playerCount = settings.playerCount ?? DEFAULT_SETTINGS.playerCount;
  const dealer = settings.dealer !== "random" && PLAYER_IDS.indexOf(settings.dealer) >= playerCount
    ? "random"
    : settings.dealer;
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    playerCount,
    teams: playerCount === 4 ? settings.teams : false,
    dealer,
    playerColors: {
      ...DEFAULT_SETTINGS.playerColors,
      ...settings.playerColors,
    },
    playerShapes: {
      ...DEFAULT_SETTINGS.playerShapes,
      ...settings.playerShapes,
    },
  };
}

export function getPiecePoint(piece: Piece, board: BoardDefinition): BoardPoint {
  if (piece.position.zone === "track") {
    return getBoardTrackPoint(piece.position.index, board);
  }

  if (piece.position.zone === "home") {
    return getHomeLanePoint(piece.owner, piece.position.index, board);
  }

  throw new Error(`Cannot animate reserve piece ${piece.id} across the board.`);
}

export function getSwapControlPoint(from: BoardPoint, to: BoardPoint): BoardPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const arc = 5;

  return roundPoint({
    x: (from.x + to.x) / 2 - dy / distance * arc,
    y: (from.y + to.y) / 2 + dx / distance * arc,
  });
}

function uniqueMoves<T extends MoveChoice>(moves: readonly T[]): T[] {
  const seen = new Set<string>();
  return moves.filter((move) => {
    const key = JSON.stringify(move);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function describeMove(move: MoveChoice): string {
  if (move.kind === "split7") {
    const counts = new Map<string, number>();
    move.steps.forEach((step) => counts.set(step.pieceId, (counts.get(step.pieceId) ?? 0) + 1));
    return [...counts].map(([id, count]) => `piece ${id.split("-")[1]} × ${count}`).join(", ");
  }
  if (move.kind === "enter") return `bring piece ${move.pieceId.split("-")[1]} onto its entry`;
  if (move.kind === "swap") return `swap ${shortPiece(move.pieceId)} with ${shortPiece(move.targetPieceId)}`;
  const direction = move.kind === "backward" ? "backward" : "forward";
  const destination = move.destination.zone === "home" ? `home ${move.destination.index + 1}` : `track ${move.destination.index + 1}`;
  return `move ${shortPiece(move.pieceId)} ${direction} to ${destination}${move.capturedPieceId ? `, bumping ${shortPiece(move.capturedPieceId)}` : ""}`;
}

function shortPiece(pieceId: string) {
  const [owner, number] = pieceId.split("-");
  return `${PLAYER_META[owner as PlayerId].name} ${number}`;
}

function actionPrompt(card: Card, assignedSteps: number, hasSelectedPiece: boolean) {
  if (hasSelectedPiece) {
    return card.rank === "7"
      ? `Choose the glowing destination for step ${assignedSteps + 1} of 7.`
      : "Choose a glowing destination to complete the move.";
  }
  if (card.rank === "7" && assignedSteps > 0) return `Choose the piece for step ${assignedSteps + 1} of 7.`;
  if (card.rank === "J") return "Choose a piece, then choose its swap target.";
  if (card.rank === "5") return "The 5 may move any piece on the track.";
  return "Choose one of the glowing pieces.";
}

function cardHelp(card: Card) {
  switch (card.rank) {
    case "A": return "Enter a reserve piece, or move forward 1 or 11.";
    case "4": return "Move one of your track pieces backward 4.";
    case "5": return "Move any track piece forward 5.";
    case "7": return "Assign all seven forward steps, one piece at a time.";
    case "J": return "Swap one of your track pieces with another track piece.";
    case "K": return "Enter a reserve piece, or move forward 13.";
    case "Q": return "Move one piece forward 12.";
    default: return `Move one piece forward ${card.rank}.`;
  }
}

function waitForAnimation(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}
