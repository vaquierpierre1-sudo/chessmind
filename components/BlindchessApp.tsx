"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./Brand";
import { ImportScreen } from "./ImportScreen";
import { ReviewScreen } from "./ReviewScreen";
import { PlayScreen } from "./PlayScreen";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { AnalysisMode, CoachStatus, GameAnalysis } from "@/lib/types";
import { DEFAULT_VOICE_ID, normalizeVoiceId, type VoiceId } from "@/lib/voices";

type Screen = "import" | "review" | "play";

const TITLES: Record<Screen, string> = {
  import: "Blindchess — Hear what you missed",
  review: "Analysis — Blindchess",
  play: "Blindfold play — Blindchess",
};

export function BlindchessApp() {
  const [screen, setScreen] = useState<Screen>("import");
  const [pgnText, setPgnText] = useState("");
  const [side, setSide] = useState<"white" | "black">("white");
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [activeMoveId, setActiveMoveId] = useState<string | null>(null);
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [highContrast, setHighContrast] = usePersistentState("chessmind.highContrast", false);
  const [speechRate, setSpeechRate] = usePersistentState("chessmind.speechRate", 1);
  const [voiceId, setVoiceId] = usePersistentState<VoiceId>("chessmind.voice.v2", DEFAULT_VOICE_ID);
  const [analysisMode, setAnalysisMode] = usePersistentState<AnalysisMode>("chessmind.analysisMode", "standard");
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

  const completeAnalysis = (result: GameAnalysis) => {
    setAnalysis(result);
    setActiveMoveId(result.mistakes[0]?.id ?? result.timeline[0]?.id ?? null);
    setSide(result.side);
    goTo("review");
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" type="button" onClick={() => goTo("import")} aria-label="Blindchess home">
            <BrandMark />
            <span>
              Blind<span>chess</span>
            </span>
          </button>

          <nav className="step-nav" aria-label="Blindchess sections">
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
                  <span>Analysis</span>
                </button>
                {!analysis && <span id="review-step-hint" className="sr-only">Import and analyze a game first.</span>}
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
            analysisMode={analysisMode}
            onAnalysisModeChange={setAnalysisMode}
            speechRate={speechRate}
            onSpeechRateChange={setSpeechRate}
            voiceId={selectedVoice}
            onVoiceChange={setVoiceId}
            coachStatus={status}
            ttsConfigured={status?.ttsConfigured ?? null}
            selectedMoveId={activeMoveId}
            onSelectMove={setActiveMoveId}
            onBack={() => goTo("import")}
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
              Blindchess is built for blind and visually impaired players. Play on your usual platform, then bring the PGN here.
            </p>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <p>
          <span>Blindchess</span> · Talk-first chess coaching for blind and visually impaired players. Your PGN is
          analyzed on this server; only the selected move facts are sent to OpenAI when you talk to the coach.
        </p>
        <p className="footer-note">Stockfish 19 Lite powers the review. No analysis is mocked.</p>
      </footer>
    </div>
  );
}
