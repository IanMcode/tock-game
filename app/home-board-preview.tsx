"use client";

import { createGame } from "../src/game/createGame";
import { getRulesetDefinition } from "../src/game/definition";
import { Board } from "./game-table";

const previewGame = createGame({
  shuffle: false,
  dealer: "P1",
  playerCount: 4,
  teams: true,
  startWithPieceOnEntry: true,
});
const previewRuleset = getRulesetDefinition(previewGame.rulesetId);
const previewPieces = previewGame.players.flatMap((player) => player.pieces);

export default function HomeBoardPreview() {
  return (
    <div className="home-board-inert" inert>
      <Board
        pieces={previewPieces}
        boardDefinition={previewRuleset.board}
        teamMode
        activePieceIds={new Set()}
        hoppingPieces={[]}
        swappingPieces={[]}
        capturingPieceIds={[]}
        players={previewGame.players}
        dealer={previewGame.dealer}
        dealIndex={previewGame.dealIndex}
        dealCount={previewRuleset.dealSchedule.length}
        currentPlayerId={previewGame.currentPlayer}
        selectedPieceId={null}
        destinationMoves={[]}
        showSpaceNumbers
        onToggleSpaceNumbers={() => undefined}
        onPieceClick={() => undefined}
        onDestinationClick={() => undefined}
        perspectivePlayerId="P1"
        reservePresentation="board-grid"
        showToolbar={false}
      />
    </div>
  );
}
