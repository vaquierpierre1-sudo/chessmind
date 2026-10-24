"use client";

import {
  describePgnResult,
  formatGameDate,
  mistakeSummary,
  moveLabel,
} from "@/lib/chess-utils";
import type { GameAnalysis, Mistake } from "@/lib/types";

type ReviewScreenProps = {
  analysis: GameAnalysis;
  onBack: () => void;
  onOpenCoach: (mistakeId: string) => void;
};

function lossLabel(mistake: Mistake) {
  if (mistake.cpLoss >= 5000) return "Forced mate swing";
  return `${(mistake.cpLoss / 100).toFixed(1)} pawns lost`;
}

function PlayerLine({
  name,
  elo,
  color,
  isYou,
}: {
  name: string;
  elo?: string;
  color: "white" | "black";
  isYou: boolean;
}) {
  return (
    <div className={`player-line player-${color}`}>
      <span className={`player-piece player-piece-${color}`} aria-hidden="true">
        {color === "white" ? "♔" : "♚"}
      </span>
      <span>
        <span className="player-name">{name}</span>
        {elo && <span className="player-elo">{elo}</span>}
        <span className="player-color">
          {color === "white" ? "White" : "Black"}
          {isYou ? " · you" : ""}
        </span>
      </span>
    </div>
  );
}

export function ReviewScreen({ analysis, onBack, onOpenCoach }: ReviewScreenProps) {
  const { game } = analysis;
  const movePairs: Array<{ number: number; white?: string; black?: string }> = [];
  for (let index = 0; index < game.moves.length; index += 2) {
    movePairs.push({
      number: Math.floor(index / 2) + 1,
      white: game.moves[index]?.san,
      black: game.moves[index + 1]?.san,
    });
  }
  const displayResult = game.result === "*" ? "Unfinished" : game.result;

  return (
    <div className="screen review-screen">
      <header className="screen-heading-row">
        <div>
          <p className="eyebrow">Game review</p>
          <h1 id="review-heading" tabIndex={-1}>
            Your game,{" "}
            <br />
            <em>replayed.</em>
          </h1>
          <p className="lede">
            {describePgnResult(game.result, game.white, game.black)}. Stockfish ranked the moments where the
            evaluation turned against you.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M19 12H5m5 5-5-5 5-5" />
          </svg>
          Import another game
        </button>
      </header>

      <section className="game-summary" aria-labelledby="game-summary-heading">
        <h2 id="game-summary-heading" className="sr-only">
          Game summary
        </h2>
        <div className="summary-main">
          <div className="players">
            <PlayerLine
              name={game.white}
              elo={game.whiteElo}
              color="white"
              isYou={analysis.side === "white"}
            />
            <span className="versus">vs</span>
            <PlayerLine
              name={game.black}
              elo={game.blackElo}
              color="black"
              isYou={analysis.side === "black"}
            />
          </div>
          <div className="result-block">
            <span className="result-label">Result</span>
            <strong>{displayResult}</strong>
          </div>
        </div>
        <dl className="game-meta">
          <div>
            <dt>Event</dt>
            <dd>{game.event}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatGameDate(game.date)}</dd>
          </div>
          <div>
            <dt>Moves</dt>
            <dd>{Math.ceil(game.plyCount / 2)} full moves</dd>
          </div>
          {game.opening && (
            <div>
              <dt>Opening</dt>
              <dd>{game.opening}</dd>
            </div>
          )}
          {game.timeControl && (
            <div>
              <dt>Time control</dt>
              <dd>{game.timeControl}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="stats-grid" aria-label="Review statistics">
        <article className="stat-card stat-primary">
          <p className="stat-label">Estimated accuracy</p>
          <p className="stat-value">
            {analysis.playerMoveCount > 0 ? analysis.accuracy.toFixed(1) : "—"}
            <span aria-hidden="true">%</span>
            <span className="sr-only"> percent</span>
          </p>
          <p className="stat-note">Based on how your win chances changed after each move.</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Average loss</p>
          <p className="stat-value">
            {analysis.playerMoveCount > 0 ? analysis.acpl : "—"}
            <span aria-hidden="true" className="stat-unit">cp</span>
            <span className="sr-only"> centipawns</span>
          </p>
          <p className="stat-note">Centipawns lost per move, from your side.</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Turning points</p>
          <p className="stat-value">{analysis.mistakes.length}</p>
          <p className="stat-note">The largest evaluation losses, listed below.</p>
        </article>
      </section>

      <section className="turning-points" aria-labelledby="turning-points-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">What changed the game</p>
            <h2 id="turning-points-heading">Biggest turning points</h2>
          </div>
          <p>
            Ranked by evaluation lost. Choose one to hear what happened and what the engine wanted instead.
          </p>
        </div>

        {analysis.mistakes.length === 0 ? (
          <div className="empty-card">
            <span className="empty-mark" aria-hidden="true">
              ✓
            </span>
            <h3>{analysis.playerMoveCount === 0 ? "No moves to review" : "No clear mistakes found"}</h3>
            <p>
              {analysis.playerMoveCount === 0
                ? `The game record contains no moves by ${analysis.side === "white" ? "White" : "Black"}.`
                : "Stockfish did not find a move from your side that lost half a pawn or more. Try another game to keep exploring."}
            </p>
            <button type="button" className="primary-button" onClick={onBack}>
              Import another game
            </button>
          </div>
        ) : (
          <div className="mistake-list">
            {analysis.mistakes.map((mistake, index) => (
              <article className={`mistake-card kind-${mistake.kind}`} key={mistake.id}>
                <div className="mistake-head">
                  <span className="mistake-rank" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="mistake-title">
                    <p className="mistake-kicker">
                      Your move {moveLabel(mistake.moveNumber, mistake.color, "")}
                    </p>
                    <h3 className="mistake-move">
                      {mistake.san}
                      <span className={`kind-badge kind-badge-${mistake.kind}`}>{mistake.kind}</span>
                    </h3>
                  </div>
                  <div className="mistake-loss" aria-label={`Evaluation loss: ${lossLabel(mistake)}`}>
                    <strong>{lossLabel(mistake)}</strong>
                    <span>from your side</span>
                  </div>
                </div>

                <p className="mistake-copy">{mistakeSummary(mistake)}</p>

                <dl className="eval-strip">
                  <div>
                    <dt>Your evaluation</dt>
                    <dd>
                      {mistake.evalBeforePlayer} <span aria-hidden="true">→</span>
                      <span className="sr-only"> changed to </span> {mistake.evalAfterPlayer}
                    </dd>
                  </div>
                  <div>
                    <dt>Stockfish preferred</dt>
                    <dd>{mistake.bestSan}</dd>
                  </div>
                  <div>
                    <dt>Engine line</dt>
                    <dd>{mistake.bestLineSan.slice(0, 4).join(" ")}</dd>
                  </div>
                </dl>

                <div className="mistake-footer">
                  <p>
                    <span className="status-dot" aria-hidden="true" />
                    {mistake.materialAfter}.
                  </p>
                  <button
                    type="button"
                    className="coach-button"
                    onClick={() => onOpenCoach(mistake.id)}
                  >
                    Talk this through
                    <span className="sr-only"> about move {mistake.moveNumber}, {mistake.san}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M5 12h14m-5-5 5 5-5 5" />
                    </svg>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="move-list-details">
        <summary>
          <span>View every move</span>
          <span className="summary-count">{game.plyCount} half-moves</span>
        </summary>
        <ol className="move-pairs">
          {movePairs.map((pair) => (
            <li key={pair.number}>
              <span className="pair-number">{pair.number}.</span>
              <span>{pair.white ?? "—"}</span>
              <span>{pair.black ?? ""}</span>
            </li>
          ))}
        </ol>
      </details>

      <p className="analysis-footnote">
        <strong>How this was measured.</strong> {analysis.engine} evaluated {analysis.analyzedPositions}{" "}
        positions. Mistakes are moves that lost at least 0.5 pawns of evaluation from your side. Accuracy is an
        estimate from engine win probability, not an official chess rating.
      </p>
    </div>
  );
}
