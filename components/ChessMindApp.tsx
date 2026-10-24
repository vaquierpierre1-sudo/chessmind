"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./Brand";
import { ImportScreen } from "./ImportScreen";
import { ReviewScreen } from "./ReviewScreen";
import { CoachScreen } from "./CoachScreen";
import { PlayScreen } from "./PlayScreen";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { CoachStatus, GameAnalysis } from "@/lib/types";
import { DEFAULT_VOICE_ID, normalizeVoiceId, type VoiceId } from "@/lib/voices";

type Screen = "import" | "review" | "coach" | "play";

const TITLES: Record<Screen, string> = {
  import: "ChessMind — Hear what you missed",
  review: "Game review — ChessMind",
  coach: "AI coach — ChessMind",
  play: "Blindfold play — ChessMind",
};

export function ChessMindApp() {
  const [screen, setScreen] = useState<Screen>("import");
  const [pgnText, setPgnText] = useState("");
  const [side, setSide] = useState<"white" | "black">("white");
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [activeMistakeId, setActiveMistakeId] = useState<string | null>(null);
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [highContrast, setHighContrast] = usePersistentState("chessmind.highContrast", false);
  const [speechRate, setSpeechRate] = usePersistentState("chessmind.speechRate", 1);
  const [voiceId, setVoiceId] = usePersistentState<VoiceId>("chessmind.voice.v2", DEFAULT_VOICE_ID);
  const selectedVoice = normalizeVoiceId(voiceId);
  const firstScreen = useRef(true);

  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? "high" : "normal";
  }, [highContrast]);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CoachStatus | null) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    document.title = TITLES[screen];
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    const heading = document.getElementById(`${screen}-heading`);
    heading?.focus();
  }, [screen]);

  const goTo = (next: Screen) => {
    setScreen(next);
  };

  const openCoach = (mistakeId?: string) => {
    if (!analysis?.mistakes.length) return;
    setActiveMistakeId(mistakeId ?? analysis.mistakes[0].id);
    goTo("coach");
  };

  const completeAnalysis = (result: GameAnalysis) => {
    setAnalysis(result);
    setActiveMistakeId(result.mistakes[0]?.id ?? null);
    setSide(result.side);
    goTo("review");
  };

  const hasMistakes = Boolean(analysis?.mistakes.length);
  const activeMistake =
    analysis?.mistakes.find((mistake) => mistake.id === activeMistakeId) ?? analysis?.mistakes[0] ?? null;

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={() => goTo("import")} aria-label="ChessMind home">
            <BrandMark />
            <span>
              Chess<span>Mind</span>
            </span>
          </button>

          <nav className="step-nav" aria-label="Game review steps">
            <ol>
              <li>
                <button
                  type="button"
                  className={screen === "import" ? "step-link is-current" : "step-link"}
                  aria-current={screen === "import" ? "step" : undefined}
                  onClick={() => goTo("import")}
                >
                  <span className="step-number" aria-hidden="true">1</span>
                  <span>Import</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={screen === "review" ? "step-link is-current" : "step-link"}
                  aria-current={screen === "review" ? "step" : undefined}
                  onClick={() => goTo("review")}
                  disabled={!analysis}
                  aria-describedby={!analysis ? "review-step-hint" : undefined}
                >
                  <span className="step-number" aria-hidden="true">2</span>
                  <span>Review</span>
                </button>
                {!analysis && <span id="review-step-hint" className="sr-only">Import and analyze a game first.</span>}
              </li>
              <li>
                <button
                  type="button"
                  className={screen === "coach" ? "step-link is-current" : "step-link"}
                  aria-current={screen === "coach" ? "step" : undefined}
                  onClick={() => openCoach()}
                  disabled={!hasMistakes}
                  aria-describedby={!hasMistakes ? "coach-step-hint" : undefined}
                >
                  <span className="step-number" aria-hidden="true">3</span>
                  <span>Coach</span>
                </button>
                {!hasMistakes && (
                  <span id="coach-step-hint" className="sr-only">
                    Analyze a game with at least one clear turning point first.
                  </span>
                )}
              </li>
            </ol>
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className={screen === "play" ? "text-button play-link is-current" : "text-button play-link"}
              aria-current={screen === "play" ? "page" : undefined}
              onClick={() => goTo("play")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3a4 4 0 0 1 4 4v2.2l2 1.6v3.1l-2.8.9V19H8.8v-4.2L6 13.9v-3.1l2-1.6V7a4 4 0 0 1 4-4Z" />
              </svg>
              Play blindfold
            </button>
            <button
              type="button"
              className="contrast-toggle"
              aria-pressed={highContrast}
              onClick={() => setHighContrast((value) => !value)}
            >
              <span className="contrast-dot" aria-hidden="true" />
              <span className="contrast-label">High contrast</span>
            </button>
          </div>
        </div>
      </header>

      <main id="content" className="app-main">
        {screen === "import" && (
          <ImportScreen
            pgn={pgnText}
            onPgnChange={setPgnText}
            side={side}
            onSideChange={setSide}
            onComplete={completeAnalysis}
          />
        )}
        {screen === "review" && analysis && (
          <ReviewScreen
            analysis={analysis}
            onBack={() => goTo("import")}
            onOpenCoach={openCoach}
          />
        )}
        {screen === "coach" && analysis && activeMistake && (
          <CoachScreen
            analysis={analysis}
            mistake={activeMistake}
            coachStatus={status}
            speechRate={speechRate}
            onSpeechRateChange={setSpeechRate}
            voiceId={selectedVoice}
            onVoiceChange={setVoiceId}
            ttsConfigured={status?.ttsConfigured ?? null}
            onBack={() => goTo("review")}
            onSelectMistake={(id) => setActiveMistakeId(id)}
          />
        )}
        {screen === "play" && (
          <PlayScreen
            speechRate={speechRate}
            onSpeechRateChange={setSpeechRate}
            voiceId={selectedVoice}
            onVoiceChange={setVoiceId}
            ttsConfigured={status?.ttsConfigured ?? null}
            onLeave={() => goTo("import")}
          />
        )}

        {!analysis && screen !== "play" && (
          <div className="site-footnote">
            <p>
              ChessMind reads finished games. Play on your usual platform, then bring the PGN here.
            </p>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <p>
          <span>ChessMind</span> · Voice-first chess coaching. Your PGN is analyzed on this server; only the
          selected position facts are sent to OpenAI when you talk to the coach.
        </p>
        <p className="footer-note">Stockfish 19 Lite powers the review. No analysis is mocked.</p>
      </footer>
    </div>
  );
}
