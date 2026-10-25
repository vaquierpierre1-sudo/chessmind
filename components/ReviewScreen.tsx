"use client";

import {
  describePgnResult,
  formatGameDate,
  mistakeSummary,
  moveLabel,
} from "@/lib/chess-utils";
import { analysisModeDescription, analysisModeLabel, buildAnalysisNarration, buildAnalysisSpeech } from "@/lib/analysis-narration";
import { useSpeech } from "@/lib/use-speech";
import { CoachScreen } from "./CoachScreen";
import type { AnalysisMode, CoachStatus, GameAnalysis, Mistake } from "@/lib/types";
import type { VoiceId } from "@/lib/voices";

type ReviewScreenProps = {
  analysis: GameAnalysis;
  analysisMode: AnalysisMode;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  voiceId: VoiceId;
  onVoiceChange: (voice: VoiceId) => void;
  coachStatus: CoachStatus | null;
  ttsConfigured: boolean | null;
  selectedMoveId: string | null;
  onSelectMove: (id: string) => void;
  onBack: () => void;
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

export function ReviewScreen({
  analysis,
  analysisMode,
  onAnalysisModeChange,
  speechRate,
  onSpeechRateChange,
  voiceId,
  onVoiceChange,
  coachStatus,
  ttsConfigured,
  selectedMoveId,
  onSelectMove,
  onBack,
}: ReviewScreenProps) {
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
  const narration = buildAnalysisNarration(analysis.timeline, analysisMode);
  const speech = useSpeech(speechRate, voiceId, ttsConfigured !== false);
  const selectedMove =
    analysis.timeline.find((move) => move.id === selectedMoveId) ??
    analysis.timeline.find((move) => move.isTurningPoint) ??
    analysis.timeline[0] ??
    null;

  const hearMove = (text: string) => {
    speech.speak(text);
  };

  const hearSummary = () => {
    speech.speak(
      `Game summary. ${game.white} played White against ${game.black}. ${describePgnResult(
        game.result,
        game.white,
        game.black,
      )}. You played ${analysis.side}. Your estimated accuracy is ${analysis.accuracy.toFixed(
        1,
      )} percent, with an average loss of ${analysis.acpl} centipawns per move, across ${
        analysis.playerMoveCount
      } reviewed moves. There are ${analysis.mistakes.length} key moments. The full analysis follows, move by move.`,
    );
  };

  const openMove = (id: string) => {
    speech.cancel();
    onSelectMove(id);
    window.setTimeout(() => document.getElementById("coach-heading")?.focus(), 80);
  };

  return (
    <div className="screen review-screen">
      <header className="screen-heading-row review-header">
        <div>
          <p className="eyebrow">Blindchess analysis</p>
          <h1 id="review-heading" tabIndex={-1}>
            Hear your{" "}
            <br />
            <em>whole game.</em>
          </h1>
          <p className="lede">
            {describePgnResult(game.result, game.white, game.black)}. Every move is scored and described
            for the ear, and the coach is right here on this page.
          </p>
        </div>
        <div className="review-header-actions">
          <label className="rate-control review-mode-control">
            <span>Analysis</span>
            <select
              value={analysisMode}
              onChange={(event) => onAnalysisModeChange(event.target.value as AnalysisMode)}
            >
              <option value="standard">{analysisModeLabel("standard")}</option>
              <option value="expert">{analysisModeLabel("expert")}</option>
            </select>
          </label>
          <p className="review-mode-note">{analysisModeDescription(analysisMode)}</p>
          <button type="button" className="secondary-button compact-button" onClick={hearSummary}>
            Hear game summary
          </button>
          <button type="button" className="secondary-button" onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 12H5m5 5-5-5 5-5" />
            </svg>
            Import another game
          </button>
        </div>
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

      <section className="stats-grid" aria-label="Analysis statistics">
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
          <p className="stat-label">Key moments</p>
          <p className="stat-value">{analysis.mistakes.length}</p>
          <p className="stat-note">The clearest turning points in your game.</p>
        </article>
      </section>

      <section className="analysis-timeline" aria-labelledby="analysis-timeline-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Hear every move</p>
            <h2 id="analysis-timeline-heading">Move-by-move analysis</h2>
          </div>
          <div className="timeline-actions">
            <p>
              {analysisMode === "expert"
                ? "A fuller pass with engine ideas and evaluation swings, move by move."
                : "A short, spoken-friendly replay of the game, move by move."}
            </p>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => {
                if (speech.speaking || speech.preparing) {
                  speech.cancel();
                  return;
                }
                speech.speak(buildAnalysisSpeech(analysis.timeline, analysisMode));
              }}
            >
              {(speech.speaking || speech.preparing) ? "Stop audio" : "Hear full analysis"}
            </button>
          </div>
        </div>
        <div className="timeline-audio-status" role="status" aria-live="polite">
          {speech.preparing
            ? "Preparing the selected voice."
            : speech.speaking
              ? "Reading the analysis aloud. Press Stop audio to pause."
              : ""}
        </div>
        {speech.notice && (
          <p className="voice-warning" role="status">
            {speech.notice}
          </p>
        )}
        {speech.error && (
          <p className="voice-warning" role="status">
            {speech.error}
          </p>
        )}
        <div className="analysis-transcript">
          {narration.map((entry) => (
            <article className={`analysis-entry${entry.move.isTurningPoint ? " is-turning-point" : ""}`} key={entry.id}>
              <p className="analysis-entry-head">{entry.headline}</p>
              <p className="analysis-entry-text">{entry.summary}</p>
              <div className="analysis-entry-actions">
                <button
                  type="button"
                  className="link-button analysis-entry-link"
                  aria-label={`Hear move ${entry.headline}`}
                  onClick={() => hearMove(entry.summary)}
                >
                  Hear this move
                </button>
                <button
                  type="button"
                  className="link-button analysis-entry-link"
                  aria-label={`Ask the coach about move ${entry.headline}`}
                  onClick={() => openMove(entry.id)}
                >
                  Ask the coach
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="turning-points" aria-labelledby="turning-points-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">What changed the game</p>
            <h2 id="turning-points-heading">Key moments</h2>
          </div>
          <p>
            The full analysis is above, move by move. These are the sharpest moments; ask the coach about any of them.
          </p>
        </div>

        {analysis.mistakes.length === 0 ? (
          <div className="empty-card">
            <span className="empty-mark" aria-hidden="true">
              ✓
            </span>
            <h3>{analysis.playerMoveCount === 0 ? "No moves to review" : "No clear turning points found"}</h3>
            <p>
              {analysis.playerMoveCount === 0
                ? `The game record contains no moves by ${analysis.side === "white" ? "White" : "Black"}.`
                : "Stockfish did not find a move from your side that lost half a pawn or more. The full move-by-move analysis is still above."}
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
                    onClick={() => openMove(mistake.id)}
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

      <section className="embedded-coach" aria-labelledby="embedded-coach-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Talk it through</p>
            <h2 id="embedded-coach-heading">Blindchess coach</h2>
          </div>
          <p>
            For blind players, every move is available by touch, keyboard, or voice. Pick a move, then hear the explanation out loud.
          </p>
        </div>
        {selectedMove ? (
          <CoachScreen
            analysis={analysis}
            analysisMode={analysisMode}
            move={selectedMove}
            coachStatus={coachStatus}
            speechRate={speechRate}
            onSpeechRateChange={onSpeechRateChange}
            voiceId={voiceId}
            onVoiceChange={onVoiceChange}
            ttsConfigured={ttsConfigured}
            onSelectMove={onSelectMove}
            embedded
          />
        ) : (
          <div className="empty-card">
            <h3>Select a move to open the coach</h3>
            <p>Choose any move in the analysis above to hear the coach explain it out loud.</p>
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
        positions. Key moments are moves that lost at least 0.5 pawns of evaluation from your side. Accuracy is
        an estimate from engine win probability, not an official chess rating.
      </p>
    </div>
  );
}
