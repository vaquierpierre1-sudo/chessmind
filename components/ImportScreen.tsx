"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { parsePgn } from "@/lib/chess-utils";
import { SAMPLE_PGN } from "@/lib/sample";
import type { AnalysisEvent, GameAnalysis, PlayerSide } from "@/lib/types";

type ImportScreenProps = {
  pgn: string;
  onPgnChange: (pgn: string) => void;
  side: PlayerSide;
  onSideChange: (side: PlayerSide) => void;
  onComplete: (analysis: GameAnalysis) => void;
};

type ProgressState = {
  completed: number;
  total: number;
  depth: number;
};

export function ImportScreen({ pgn, onPgnChange, side, onSideChange, onComplete }: ImportScreenProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [fileName, setFileName] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > 2_000_000) {
      setError("That file is larger than 2 MB. Choose a single game PGN.");
      return;
    }
    try {
      const text = await file.text();
      onPgnChange(text);
      setFileName(file.name);
      setNotice(`${file.name} loaded. Choose your side, then review your mistakes.`);
      textareaRef.current?.focus();
    } catch {
      setError("That file could not be read. Try saving it as a .pgn text file or pasting the game.");
    }
  };

  const loadSample = () => {
    onPgnChange(SAMPLE_PGN);
    onSideChange("black");
    setFileName("Opera Game sample");
    setError(null);
    setNotice("The 1858 Opera Game is loaded, set to review Black's moves. Press Review my mistakes when ready.");
    textareaRef.current?.focus();
  };

  const startAnalysis = async () => {
    setError(null);
    setNotice("");
    try {
      parsePgn(pgn);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "That PGN could not be read.");
      textareaRef.current?.focus();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn, side }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "The analysis request failed. Please try again.");
      }
      if (!response.body) throw new Error("This browser did not receive the analysis stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const processLine = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        let event: AnalysisEvent;
        try {
          event = JSON.parse(trimmed) as AnalysisEvent;
        } catch {
          return;
        }
        if (event.type === "meta") {
          setProgress({ completed: 0, total: event.totalPositions, depth: event.depth });
        } else if (event.type === "progress") {
          setProgress((current) => ({
            completed: event.completed,
            total: event.total,
            depth: current?.depth ?? 12,
          }));
        } else if (event.type === "result") {
          finished = true;
          setRunning(false);
          onComplete(event.analysis);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          processLine(line);
          newline = buffer.indexOf("\n");
        }
      }
      if (buffer.trim()) processLine(buffer);
      if (!finished && !controller.signal.aborted) {
        throw new Error("The analysis stream ended before Stockfish returned a result. Please try again.");
      }
    } catch (analysisError) {
      if (!controller.signal.aborted) {
        setError(
          analysisError instanceof Error
            ? analysisError.message
            : "Stockfish could not analyze this game. Please try again.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setRunning(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancelAnalysis = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setNotice("Analysis stopped. Your game is still here whenever you are ready.");
  };

  return (
    <div className="screen import-screen">
      <section className="import-intro" aria-labelledby="import-heading">
        <p className="eyebrow">A voice-first chess coach</p>
        <h1 id="import-heading" tabIndex={-1}>
          Hear what you{" "}
          <br />
          <em>missed.</em>
        </h1>
        <p className="lede">
          Bring a finished game. Stockfish finds up to three turning points. Then talk them through
          with a coach who explains everything out loud.
        </p>

        <ol className="how-steps">
          <li>
            <span className="how-number" aria-hidden="true">01</span>
            <div>
              <h2>Bring the game</h2>
              <p>Paste a PGN or upload the file from Lichess or Chess.com.</p>
            </div>
          </li>
          <li>
            <span className="how-number" aria-hidden="true">02</span>
            <div>
              <h2>Find the turning points</h2>
              <p>Real Stockfish analysis scores every one of your moves.</p>
            </div>
          </li>
          <li>
            <span className="how-number" aria-hidden="true">03</span>
            <div>
              <h2>Talk it through</h2>
              <p>Ask by voice or text. The coach answers with clear square-by-square detail.</p>
            </div>
          </li>
        </ol>

        <p className="access-promise">
          <span className="access-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 10v4h3l5 4V6L7 10H4Zm12.5-2.5a6 6 0 0 1 0 9M19 5a10 10 0 0 1 0 14" />
            </svg>
          </span>
          No board required. Every control is keyboard accessible, screen-reader friendly, and available as
          text and speech.
        </p>
      </section>

      <section className="import-panel" aria-labelledby="import-form-heading">
        <div className="panel-heading">
          <p className="panel-kicker">Start here</p>
          <h2 id="import-form-heading">Review a game</h2>
          <p>One game at a time. Your PGN stays on this server for analysis.</p>
        </div>

        <div className="field-group">
          <div className="label-row">
            <label className="field-label" htmlFor="pgn-input">
              1. Paste your PGN
            </label>
            <span className="field-hint">Lichess or Chess.com export</span>
          </div>
          <textarea
            ref={textareaRef}
            id="pgn-input"
            className="pgn-textarea"
            value={pgn}
            onChange={(event) => {
              onPgnChange(event.target.value);
              setError(null);
              setFileName("");
            }}
            rows={9}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="pgn-help"
            placeholder={'[Event "Casual game"]\n[White "..."]\n[Black "..."]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
            disabled={running}
          />
          <p id="pgn-help" className="field-hint">
            {fileName ? `${fileName} loaded. ` : ""}
            Move comments and clock annotations are welcome. Variations are ignored if the game still parses.
          </p>

          <div className="pgn-actions">
            <label className="file-control">
              <input
                type="file"
                accept=".pgn,text/plain,application/x-chess-pgn"
                onChange={readFile}
                disabled={running}
                aria-label="Choose a PGN file"
              />
              <span className="secondary-button file-button">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" />
                </svg>
                Choose PGN file
              </span>
            </label>
            <button type="button" className="link-button" onClick={loadSample} disabled={running}>
              Try the 1858 Opera Game as Black
            </button>
          </div>
        </div>

        <fieldset className="field-group side-fieldset" disabled={running}>
          <legend className="field-label">2. Which side did you play?</legend>
          <div className="segmented-control">
            <label>
              <input
                type="radio"
                name="player-side"
                value="white"
                checked={side === "white"}
                onChange={() => onSideChange("white")}
              />
              <span>
                <span className="piece-swatch swatch-white" aria-hidden="true">♔</span>
                White
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="player-side"
                value="black"
                checked={side === "black"}
                onChange={() => onSideChange("black")}
              />
              <span>
                <span className="piece-swatch swatch-black" aria-hidden="true">♚</span>
                Black
              </span>
            </label>
          </div>
          <p className="field-hint">Stockfish will review only the moves made by this side.</p>
        </fieldset>

        {error && (
          <div className="alert alert-error" role="alert">
            <strong>We couldn&apos;t start the review.</strong>
            <p>{error}</p>
          </div>
        )}

        <div className="sr-only" role="status" aria-live="polite">
          {notice}
        </div>
        {notice && <p className="inline-notice">{notice}</p>}

        {!running ? (
          <button
            type="button"
            className="primary-button analyze-button"
            onClick={startAnalysis}
            disabled={!pgn.trim()}
          >
            Review my mistakes
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 12h14m-5-5 5 5-5 5" />
            </svg>
          </button>
        ) : (
          <div className="analysis-progress" role="region" aria-label="Game analysis in progress">
            <div className="analysis-progress-head">
              <span className="spinner" aria-hidden="true" />
              <div>
                <strong>Stockfish is reading the game.</strong>
                <p>
                  {progress
                    ? `Evaluating position ${progress.completed} of ${progress.total} at depth ${progress.depth}.`
                    : "Starting the engine and finding the first position."}
                </p>
              </div>
            </div>
            <progress
              aria-label="Analysis progress"
              value={progress?.completed ?? 0}
              max={progress?.total ?? 1}
            />
            <div className="analysis-progress-foot">
              <span>This can take a minute for a long game.</span>
              <button type="button" className="link-button" onClick={cancelAnalysis}>
                Cancel analysis
              </button>
            </div>
          </div>
        )}

        <p className="privacy-line">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Z" />
          </svg>
          Your PGN is not stored. The AI coach only receives facts about the mistake you choose.
        </p>
      </section>
    </div>
  );
}
