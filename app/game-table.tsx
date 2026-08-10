"use client";

import { useMemo, useState } from "react";

import { applyAtomicMove, applyPieceMove, type AtomicMove } from "../src/game/actions";
import { getEntryIndex, getHomeEntranceIndex, TRACK_SIZE } from "../src/game/board";
import { getLegalBasicCardMoves } from "../src/game/cardMoves";
import { createGame } from "../src/game/createGame";
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
  { name: string; team: string; color: string; soft: string }
> = {
  P1: { name: "Poppy", team: "Sun team", color: "#e5533d", soft: "#ffe1d8" },
  P2: { name: "River", team: "Moon team", color: "#2878b8", soft: "#dceeff" },
  P3: { name: "Sunny", team: "Sun team", color: "#d39412", soft: "#fff0bd" },
  P4: { name: "Fern", team: "Moon team", color: "#34835b", soft: "#dff3e6" },
};

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

type MoveChoice = AtomicMove | SplitSevenMove;
type DestinationOption = {
  move: AtomicMove;
  splitSteps?: ForwardMove[];
};
type HoppingPiece = AnimatedPiecePosition & {
  piece: Piece;
  frame: number;
};
type RecentPlay = {
  actor: string;
  card: Card;
  summary: string;
  verb: "played" | "discarded";
};

export default function GameTable({ initialGame }: { initialGame: GameState }) {
  const [game, setGame] = useState(initialGame);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [splitSteps, setSplitSteps] = useState<ForwardMove[]>([]);
  const [destinationMoves, setDestinationMoves] = useState<DestinationOption[]>([]);
  const [hoppingPieces, setHoppingPieces] = useState<HoppingPiece[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSpaceNumbers, setShowSpaceNumbers] = useState(true);
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
  const legalMoves = useMemo(
    () =>
      selectedCard && !forcedDiscard
        ? getLegalBasicCardMoves(allPieces, game.currentPlayer, selectedCard)
        : [],
    [allPieces, forcedDiscard, game.currentPlayer, selectedCard],
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
      setIsAnimating(false);
    }
  }

  async function animateMoves(
    startingPieces: readonly Piece[],
    moves: readonly AtomicMove[],
  ) {
    let pieces = [...startingPieces];
    let frameNumber = 0;

    for (const move of moves) {
      const frames = getMoveAnimationFrames(pieces, move);

      for (const frame of frames) {
        frameNumber += 1;
        setHoppingPieces(frame.flatMap((animated) => {
          const piece = pieces.find((candidate) => candidate.id === animated.pieceId);
          return piece ? [{ ...animated, piece, frame: frameNumber }] : [];
        }));
        await waitForHop();
      }

      pieces = applyAtomicMove(pieces, move);
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
    const next = createGame();
    setGame(next);
    setRecentPlay(null);
    setHistory([`${PLAYER_META[next.dealer].name} dealt a new game.`]);
    resetSelection();
  }

  const controlledPlayer = getControlledPlayer(allPieces, game.currentPlayer);

  return (
    <main className={`game-shell ${isAnimating ? "is-animating" : ""}`} aria-busy={isAnimating}>
      <header className="topbar">
        <div>
          <p className="eyebrow">A local partner game</p>
          <h1>Tock</h1>
        </div>
        <div className="topbar-actions">
          <div className="deal-chip">
            <span>Dealer</span>
            <strong>{PLAYER_META[game.dealer].name}</strong>
            <small>hand {game.dealIndex + 1} of 3</small>
          </div>
          <button className="quiet-button" disabled={isAnimating} onClick={newGame}>New game</button>
        </div>
      </header>

      {game.winningTeam ? (
        <section className="winner-banner">
          <span>Game complete</span>
          <h2>{PLAYER_META[game.winningTeam[0]].team} wins the table</h2>
          <button onClick={newGame}>Play again</button>
        </section>
      ) : game.phase === "exchange" ? (
        <section className="exchange-banner">
          <div>
            <p className="eyebrow">Blind partner exchange</p>
            <h2>Each player passes one card across the table.</h2>
          </div>
          <p>{Object.keys(game.exchangeSelections).length} of 4 cards chosen</p>
        </section>
      ) : (
        <section className="turn-banner" style={{ "--player": PLAYER_META[game.currentPlayer].color } as React.CSSProperties}>
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
          activePieceIds={activePieceIds}
          hoppingPieces={hoppingPieces}
          players={game.players}
          dealer={game.dealer}
          dealIndex={game.dealIndex}
          selectedPieceId={selectedPieceId}
          destinationMoves={destinationMoves}
          showSpaceNumbers={showSpaceNumbers}
          onToggleSpaceNumbers={() => setShowSpaceNumbers((shown) => !shown)}
          onPieceClick={choosePiece}
          onDestinationClick={chooseDestination}
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
          return (
            <article
              className={`player-panel ${isCurrent ? "is-current" : ""}`}
              key={player.id}
              style={{ "--player": meta.color, "--player-soft": meta.soft } as React.CSSProperties}
            >
              <div className="player-heading">
                <div className="player-badge">{player.id.slice(1)}</div>
                <div>
                  <h3>{meta.name}</h3>
                  <p>{meta.team} · partner {PLAYER_META[getPartner(player.id)].name}</p>
                </div>
                {game.phase === "exchange" ? (
                  <div className={`exchange-status ${choseExchange ? "is-chosen" : ""}`}>
                    {choseExchange ? "Pass chosen ✓" : "Choose 1 card"}
                  </div>
                ) : (
                  <div className="piece-summary">
                    <span>{player.pieces.filter((piece) => piece.position.zone === "home").length} home</span>
                    <span>{player.pieces.filter((piece) => piece.position.zone === "reserve").length} reserve</span>
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
    </main>
  );
}

function Board({
  pieces,
  activePieceIds,
  hoppingPieces,
  players,
  dealer,
  dealIndex,
  selectedPieceId,
  destinationMoves,
  showSpaceNumbers,
  onToggleSpaceNumbers,
  onPieceClick,
  onDestinationClick,
}: {
  pieces: readonly Piece[];
  activePieceIds: ReadonlySet<string>;
  hoppingPieces: readonly HoppingPiece[];
  players: GameState["players"];
  dealer: PlayerId;
  dealIndex: GameState["dealIndex"];
  selectedPieceId: string | null;
  destinationMoves: readonly DestinationOption[];
  showSpaceNumbers: boolean;
  onToggleSpaceNumbers: () => void;
  onPieceClick: (pieceId: string) => void;
  onDestinationClick: (option: DestinationOption) => void;
}) {
  const hoppingPieceIds = new Set(hoppingPieces.map((animated) => animated.piece.id));
  const destinationColor = selectedPieceId
    ? PLAYER_META[pieces.find((piece) => piece.id === selectedPieceId)?.owner ?? "P1"].color
    : PLAYER_META.P1.color;

  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <div>
          <p className="eyebrow">The playing board</p>
          <span>72 track spaces · four home lanes</span>
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
      <div className="board" aria-label="72-space Tock board">
        <div className="board-center">
          <span>TOCK</span>
          <small>partners across</small>
        </div>
        {PLAYER_IDS.map((owner) => {
          const reservePieces = pieces.filter(
            (piece) =>
              piece.owner === owner &&
              piece.position.zone === "reserve" &&
              !hoppingPieceIds.has(piece.id),
          );
          const handCount = players.find((player) => player.id === owner)?.hand.length ?? 0;
          return (
            <div
              className={`board-reserve reserve-${owner.toLowerCase()} ${owner === dealer ? "is-dealer" : ""}`}
              key={`${owner}-reserve`}
              style={{
                "--reserve": PLAYER_META[owner].color,
                "--reserve-soft": PLAYER_META[owner].soft,
              } as React.CSSProperties}
              aria-label={`${PLAYER_META[owner].name}'s reserve`}
            >
              <div className="reserve-heading">
                <span>{PLAYER_META[owner].name}</span>
                {owner === dealer && (
                  <span
                    className="board-dealer"
                    aria-label={`${PLAYER_META[owner].name} is the dealer, hand ${dealIndex + 1} of 3`}
                  >
                    <DeckIcon />
                    <span>
                      <strong>Dealer</strong>
                      <small>Hand {dealIndex + 1} of 3</small>
                    </span>
                  </span>
                )}
              </div>
              <div
                className="board-hand-count"
                aria-label={`${PLAYER_META[owner].name} has ${handCount} ${handCount === 1 ? "card" : "cards"} remaining`}
              >
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
                    onClick={() => onPieceClick(piece.id)}
                  />
                )) : <small>All in play</small>}
              </div>
            </div>
          );
        })}
        {Array.from({ length: TRACK_SIZE }, (_, index) => {
          const point = getCrossTrackPoint(index);
          const occupant = pieces.find(
            (piece) =>
              piece.position.zone === "track" &&
              piece.position.index === index &&
              !hoppingPieceIds.has(piece.id),
          );
          const owner = PLAYER_IDS[Math.floor(index / 18)];
          const entryOwner = PLAYER_IDS.find((id) => getEntryIndex(id) === index);
          const destinationMove = destinationMoves.find(
            (option) => option.move.destination.zone === "track" && option.move.destination.index === index,
          );
          return (
            <div
              className={`track-space ${entryOwner ? "entry-space" : ""} ${destinationMove ? "possible-destination" : ""}`}
              key={index}
              style={{ left: `${point.x}%`, top: `${point.y}%`, "--section": PLAYER_META[owner].soft, "--entry": entryOwner ? PLAYER_META[entryOwner].color : undefined, "--destination": destinationColor } as React.CSSProperties}
            >
              <span className="space-number" aria-hidden="true">
                {showSpaceNumbers ? index % 18 + 1 : ""}
              </span>
              {occupant && (
                <PieceButton
                  piece={occupant}
                  active={activePieceIds.has(occupant.id)}
                  selected={selectedPieceId === occupant.id}
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
        {PLAYER_IDS.flatMap((owner) => {
          return Array.from({ length: 4 }, (_, index) => {
            const point = getHomeLanePoint(owner, index);
            const occupant = pieces.find(
              (piece) =>
                piece.owner === owner &&
                piece.position.zone === "home" &&
                piece.position.index === index &&
                !hoppingPieceIds.has(piece.id),
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
                style={{ left: `${point.x}%`, top: `${point.y}%`, "--home": PLAYER_META[owner].soft, "--destination": destinationColor } as React.CSSProperties}
              >
                {occupant && (
                  <PieceButton
                    piece={occupant}
                    active={activePieceIds.has(occupant.id)}
                    selected={selectedPieceId === occupant.id}
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
            ? getCrossTrackPoint(animated.position.index)
            : getHomeLanePoint(animated.piece.owner, animated.position.index);
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
                width: animated.position.zone === "home" ? "3.7%" : "4.25%",
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
                onClick={() => undefined}
              />
            </div>
          );
        })}
      </div>
      <div className="team-key">
        <span><i style={{ background: PLAYER_META.P1.color }} /> Poppy + Sunny</span>
        <span><i style={{ background: PLAYER_META.P2.color }} /> River + Fern</span>
        <span className="protection-key"><b>✦</b> Protected entry</span>
      </div>
    </div>
  );
}

function CardButton({ card, selected, exchangeSelected, playable, dimmed, disabled, onClick }: {
  card: Card;
  selected: boolean;
  exchangeSelected: boolean;
  playable: boolean;
  dimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <button
      className={`playing-card ${red ? "red" : "black"} ${selected ? "selected" : ""} ${exchangeSelected ? "exchange-selected" : ""} ${playable ? "playable" : ""} ${dimmed ? "dimmed" : ""}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={`${card.rank} of ${card.suit}`}
      aria-pressed={selected}
    >
      <CardFace card={card} />
    </button>
  );
}

function CardFace({ card, className = "" }: { card: Card; className?: string }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span className={`card-face ${red ? "red" : "black"} ${className}`}>
      <span>{card.rank}</span>
      <strong>{SUIT_SYMBOL[card.suit]}</strong>
      <small>{card.rank}</small>
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

function PieceButton({ piece, active, selected, hopping = false, onClick }: {
  piece: Piece;
  active: boolean;
  selected: boolean;
  hopping?: boolean;
  onClick: () => void;
}) {
  const pieceNumber = Number(piece.id.split("-")[1]);

  return (
    <button
      className={`piece ${active ? "active" : ""} ${selected ? "selected" : ""} ${hopping ? "is-hopping" : ""} ${piece.position.zone === "track" && piece.position.isEntryProtected ? "protected" : ""}`}
      style={{ "--piece": PLAYER_META[piece.owner].color, width: hopping ? "90%" : undefined } as React.CSSProperties}
      onClick={() => {
        if (active) onClick();
      }}
      aria-disabled={!active}
      tabIndex={active ? 0 : -1}
      aria-label={`${PLAYER_META[piece.owner].name} piece ${pieceNumber}${piece.position.zone === "track" && piece.position.isEntryProtected ? ", protected entry" : ""}`}
    >
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

function getCrossTrackPoint(trackIndex: number) {
  const quarter = Math.floor(trackIndex / 18);
  const distance = trackIndex % 18 * 5;
  let point = getFirstQuarterPoint(distance);

  for (let rotation = 0; rotation < quarter; rotation += 1) {
    point = { x: 100 - point.y, y: point.x };
  }

  return roundPoint(point);
}

function getFirstQuarterPoint(distance: number) {
  if (distance <= 24) return { x: 38 + distance, y: 5 };
  if (distance <= 57) return { x: 62, y: 5 + distance - 24 };
  return { x: 62 + distance - 57, y: 38 };
}

function getHomeLanePoint(owner: PlayerId, homeIndex: number) {
  const gate = getCrossTrackPoint(getHomeEntranceIndex(owner));
  const inwardDirection: Record<PlayerId, { x: number; y: number }> = {
    P1: { x: 0, y: 1 },
    P2: { x: -1, y: 0 },
    P3: { x: 0, y: -1 },
    P4: { x: 1, y: 0 },
  };
  const direction = inwardDirection[owner];
  const distance = 5 + homeIndex * 4.7;
  return roundPoint({
    x: gate.x + direction.x * distance,
    y: gate.y + direction.y * distance,
  });
}

function roundPoint(point: { x: number; y: number }) {
  return {
    x: Number(point.x.toFixed(4)),
    y: Number(point.y.toFixed(4)),
  };
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

function waitForHop() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 130));
}
