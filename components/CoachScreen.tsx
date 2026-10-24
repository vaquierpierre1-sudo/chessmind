"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChessBoard } from "./ChessBoard";
import { moveLabel } from "@/lib/chess-utils";
import { describePosition } from "@/lib/move-speech";
import { useSpeech, useSpeechRecognition } from "@/lib/use-speech";
import { VOICE_PREVIEW_TEXT, voiceLabel, type VoiceId } from "@/lib/voices";
import { VoicePicker } from "./VoicePicker";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { CoachMessage, CoachStatus, GameAnalysis, Mistake } from "@/lib/types";

type CoachScreenProps = {
  analysis: GameAnalysis;
  mistake: Mistake;
  coachStatus: CoachStatus | null;
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  voiceId: VoiceId;
  onVoiceChange: (voice: VoiceId) => void;
  ttsConfigured: boolean | null;
  onBack: () => void;
  onSelectMistake: (id: string) => void;
};

const SUGGESTED_QUESTIONS = [
  "Why was my move bad?",
  "What was the better plan?",
  "Describe the position.",
  "What rule should I remember?",
];

const OPENING_USER_MESSAGE = "Please explain this mistake to me.";

function classificationLabel(kind: Mistake["kind"]) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function CoachScreen({
  analysis,
  mistake,
  coachStatus,
  speechRate,
  onSpeechRateChange,
  voiceId,
  onVoiceChange,
  ttsConfigured,
  onBack,
  onSelectMistake,
}: CoachScreenProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [autoSpeak, setAutoSpeak] = usePersistentState("chessmind.coachSpeaks", true);
  const speech = useSpeech(speechRate, voiceId, ttsConfigured !== false);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const lastAttemptRef = useRef<{ history: CoachMessage[]; opening: boolean } | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const autoSpeakRef = useRef(autoSpeak);
  const speechRef = useRef(speech);
  autoSpeakRef.current = autoSpeak;
  speechRef.current = speech;

  const mistakeIndex = analysis.mistakes.findIndex((candidate) => candidate.id === mistake.id);
  const previousMistake = mistakeIndex > 0 ? analysis.mistakes[mistakeIndex - 1] : null;
  const nextMistake = mistakeIndex >= 0 ? analysis.mistakes[mistakeIndex + 1] : null;
  const positionDescription = describePosition(mistake.fenAfter);

  const runRequest = useCallback(
    async (history: CoachMessage[], opening: boolean) => {
      if (coachStatus?.coachConfigured === false) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const sequence = ++sequenceRef.current;
      setBusy(true);
      setError(null);
      setStreaming("");
      lastAttemptRef.current = { history, opening };
      setLiveMessage(opening ? "The coach is preparing an explanation." : "The coach is thinking.");

      let partial = "";
      try {
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mistake,
            game: analysis.game,
            side: analysis.side,
            messages: history,
            depth: analysis.depth,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "The coach could not answer just now.");
        }
        if (!response.body) throw new Error("This browser did not receive the coach's reply.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          partial += decoder.decode(value, { stream: true });
          if (sequence === sequenceRef.current) setStreaming(partial);
        }
        if (sequence !== sequenceRef.current) return;
        const content = partial.replace(/\u0000/g, "").trim();
        if (!content) throw new Error("The coach returned an empty reply. Please try again.");

        setMessages((current) => [
          ...current,
          ...(opening
            ? [{ role: "user" as const, content: OPENING_USER_MESSAGE, hidden: true }]
            : []),
          { role: "assistant", content },
        ]);
        setStreaming("");
        setError(null);
        if (autoSpeakRef.current) {
          const started = speechRef.current.speak(content);
          setLiveMessage(
            started ? "The coach has replied. The answer is being read aloud." : content,
          );
        } else {
          setLiveMessage(content);
        }
      } catch (requestError) {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        if (partial.trim()) {
          setMessages((current) => [
            ...current,
            ...(opening
              ? [{ role: "user" as const, content: OPENING_USER_MESSAGE, hidden: true }]
              : []),
            { role: "assistant", content: partial.trim() },
          ]);
          setStreaming("");
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The coach could not answer just now. Please try again.",
        );
        setLiveMessage("The coach could not reply.");
      } finally {
        if (sequence === sequenceRef.current) setBusy(false);
      }
    },
    [analysis, mistake, coachStatus],
  );

  useEffect(() => {
    abortRef.current?.abort();
    sequenceRef.current += 1;
    setMessages([]);
    setStreaming("");
    setBusy(false);
    setError(null);
    setDraft("");
    setBoardOpen(false);
    speechRef.current.cancel();
    if (coachStatus === null) {
      setLiveMessage("Checking whether the AI coach is available.");
      return;
    }
    if (coachStatus.coachConfigured === false) {
      setLiveMessage("The AI coach is not configured. Engine notes are still available.");
      return;
    }
    void runRequest([], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mistake.id, coachStatus]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      sequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) return;
    chat.scrollTop = chat.scrollHeight;
  }, [messages, streaming]);

  const sendQuestion = useCallback(
    (question: string) => {
      const content = question.trim().slice(0, 2000);
      if (!content || busy || coachStatus?.coachConfigured === false) return;
      speechRef.current.cancel();
      const history: CoachMessage[] = [...messages, { role: "user", content }];
      setMessages(history);
      setDraft("");
      setError(null);
      setLiveMessage("Question sent.");
      void runRequest(history, false);
    },
    [busy, coachStatus, messages, runRequest],
  );

  const handleTranscript = useCallback(
    (transcript: string) => {
      if (coachStatus?.coachConfigured === false) {
        setLiveMessage("The AI coach is not configured yet.");
        return;
      }
      sendQuestion(transcript);
    },
    [coachStatus, sendQuestion],
  );

  const voice = useSpeechRecognition(handleTranscript);

  useEffect(() => {
    if (voice.error) setLiveMessage(voice.error);
  }, [voice.error]);

  const toggleAutoSpeak = () => {
    const next = !autoSpeak;
    setAutoSpeak(next);
    if (!next) {
      speech.cancel();
      setLiveMessage("Spoken replies are off. New answers will appear as text.");
    } else {
      setLiveMessage("Spoken replies are on.");
    }
  };

  const readAloud = (content: string) => {
    if (!speech.supported) {
      setLiveMessage(content);
      return;
    }
    speech.speak(content);
    setLiveMessage("Preparing the answer in the selected voice.");
  };

  const previewVoice = () => {
    if (!speech.supported) {
      setLiveMessage("Spoken audio is not available in this browser.");
      return;
    }
    speech.speak(VOICE_PREVIEW_TEXT);
    setLiveMessage(`Previewing the ${voiceLabel(voiceId)} voice.`);
  };

  const describeAloud = () => {
    if (!speech.supported) {
      setLiveMessage(positionDescription);
      return;
    }
    speech.speak(`Position after your move. ${positionDescription}`);
    setLiveMessage("Reading the spoken position description.");
  };

  const startListening = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    speech.cancel();
    setLiveMessage("Listening. Ask your question.");
    voice.start();
  };

  const retry = () => {
    const attempt = lastAttemptRef.current;
    if (attempt) void runRequest(attempt.history, attempt.opening);
  };

  const submitQuestion = (question: string) => {
    if (voice.listening) voice.stop();
    sendQuestion(question);
  };

  const visibleMessages = messages.filter((message) => !message.hidden);
  const displayKind = classificationLabel(mistake.kind);

  return (
    <div className="screen coach-screen">
      <header className="screen-heading-row coach-page-heading">
        <div>
          <p className="eyebrow">AI coach</p>
          <h1 id="coach-heading" tabIndex={-1}>
            Talk it <em>through.</em>
          </h1>
          <p className="lede">
            Grounded in the engine&apos;s findings. Ask by voice or text, and hear every answer.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M19 12H5m5 5-5-5 5-5" />
          </svg>
          Back to review
        </button>
      </header>

      <div className="coach-layout">
        <aside className="mistake-context" aria-labelledby="mistake-context-heading">
          <div className="context-topline">
            <span className="context-index">
              Turning point {mistakeIndex + 1} of {analysis.mistakes.length}
            </span>
            <span className={`kind-badge kind-badge-${mistake.kind}`}>{displayKind}</span>
          </div>
          <h2 id="mistake-context-heading">
            Your move {moveLabel(mistake.moveNumber, mistake.color, "")}
          </h2>
          <p className="context-move">{mistake.san}</p>

          <dl className="context-facts">
            <div>
              <dt>You played</dt>
              <dd>{mistake.san}</dd>
            </div>
            <div>
              <dt>Stockfish preferred</dt>
              <dd>{mistake.bestSan}</dd>
            </div>
            <div>
              <dt>Evaluation for you</dt>
              <dd>
                {mistake.evalBeforePlayer} <span aria-hidden="true">→</span>
                <span className="sr-only"> changed to </span> {mistake.evalAfterPlayer}
              </dd>
            </div>
            <div>
              <dt>Engine line</dt>
              <dd>{mistake.bestLineSan.slice(0, 5).join(" ")}</dd>
            </div>
          </dl>

          <div className="context-actions">
            <button
              type="button"
              className="secondary-button compact-button"
              aria-expanded={boardOpen}
              aria-controls="coach-board"
              onClick={() => setBoardOpen((open) => !open)}
            >
              {boardOpen ? "Hide visual board" : "Show visual board"}
            </button>
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={describeAloud}
              disabled={!speech.supported}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 10v4h3l5 4V6L7 10H4Zm12.5-2.5a6 6 0 0 1 0 9M19 5a10 10 0 0 1 0 14" />
              </svg>
              Describe aloud
            </button>
          </div>

          <div id="coach-board" hidden={!boardOpen}>
            {boardOpen && (
              <ChessBoard
                fen={mistake.fenAfter}
                orientation={analysis.side}
                lastMove={{ from: mistake.from, to: mistake.to }}
                caption="Position after your move"
              />
            )}
          </div>

          <details className="position-description">
            <summary>Position description as text</summary>
            <p>{positionDescription}</p>
          </details>

          <div className="context-nav">
            <button
              type="button"
              className="link-button"
              disabled={!previousMistake}
              onClick={() => previousMistake && onSelectMistake(previousMistake.id)}
              aria-label="Previous turning point"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19 12H5m5 5-5-5 5-5" />
              </svg>
              Previous
            </button>
            <button
              type="button"
              className="link-button"
              disabled={!nextMistake}
              onClick={() => nextMistake && onSelectMistake(nextMistake.id)}
              aria-label="Next turning point"
            >
              Next
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h14m-5-5 5 5-5 5" />
              </svg>
            </button>
          </div>
        </aside>

        <section className="coach-chat-panel" aria-labelledby="conversation-heading">
          <div className="chat-toolbar">
            <div>
              <h2 id="conversation-heading">Coach conversation</h2>
              <p>Grounded in Stockfish · natural voice</p>
            </div>
            <div className="voice-settings">
              {speech.supported && (
                <>
                  <label className="switch-label">
                    <input type="checkbox" checked={autoSpeak} onChange={toggleAutoSpeak} />
                    <span className="switch-track" aria-hidden="true">
                      <span />
                    </span>
                    Speak replies
                  </label>
                  <VoicePicker
                    value={voiceId}
                    onChange={onVoiceChange}
                    onPreview={previewVoice}
                    cloudAvailable={ttsConfigured}
                  />
                  <label className="rate-control">
                    <span>Speed</span>
                    <select
                      value={String(speechRate)}
                      onChange={(event) => onSpeechRateChange(Number(event.target.value))}
                    >
                      <option value="0.8">Slow</option>
                      <option value="1">Normal</option>
                      <option value="1.2">Fast</option>
                      <option value="1.4">Faster</option>
                    </select>
                  </label>
                  {(speech.speaking || speech.preparing) && (
                    <button type="button" className="link-button stop-speaking" onClick={speech.cancel}>
                      Stop speaking
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {coachStatus?.coachConfigured === false ? (
            <div className="setup-card" role="status">
              <span className="setup-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3a4 4 0 0 1 4 4v2.2l2 1.6v3.1l-2.8.9V19H8.8v-4.2L6 13.9v-3.1l2-1.6V7a4 4 0 0 1 4-4Z" />
                </svg>
              </span>
              <h3>The AI coach needs a key</h3>
              <p>
                The Stockfish review above is complete and real. To open the conversation, add an OpenAI API
                key to the server environment and restart the app.
              </p>
              <code>OPENAI_API_KEY=sk-...</code>
              <p className="small-note">
                The key never reaches the browser. Until then, use the engine facts and spoken position
                description on this page.
              </p>
            </div>
          ) : (
            <>
              <div
                className="chat-transcript"
                ref={chatRef}
                role="log"
                aria-label="Conversation with the chess coach"
                aria-live="off"
                tabIndex={0}
              >
                {visibleMessages.length === 0 && !streaming && (
                  <div className="chat-empty">
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <p>
                      {busy ? "The coach is reading the position…" : "Start with a question, by voice or text."}
                    </p>
                  </div>
                )}

                {visibleMessages.map((message, index) => (
                  <article
                    className={`chat-message chat-${message.role}`}
                    key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
                  >
                    <p className="chat-author">{message.role === "assistant" ? "Coach" : "You"}</p>
                    <p className="chat-text">{message.content}</p>
                    {message.role === "assistant" && (
                      <button type="button" className="read-aloud-button" onClick={() => readAloud(message.content)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <path d="M4 10v4h3l5 4V6L7 10H4Zm12.5-2.5a6 6 0 0 1 0 9M19 5a10 10 0 0 1 0 14" />
                        </svg>
                        Read aloud
                      </button>
                    )}
                  </article>
                ))}

                {streaming && (
                  <article className="chat-message chat-assistant chat-streaming" aria-label="Coach is replying">
                    <p className="chat-author">Coach</p>
                    <p className="chat-text">{streaming}</p>
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </article>
                )}

                {error && (
                  <div className="alert alert-error chat-error" role="alert">
                    <strong>The coach couldn&apos;t finish that reply.</strong>
                    <p>{error}</p>
                    <button type="button" className="secondary-button compact-button" onClick={retry}>
                      Try again
                    </button>
                  </div>
                )}
              </div>

              <div className="suggested-questions" aria-label="Suggested questions">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    type="button"
                    className="question-chip"
                    key={question}
                    onClick={() => submitQuestion(question)}
                    disabled={busy}
                  >
                    {question}
                  </button>
                ))}
              </div>

              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitQuestion(draft);
                }}
              >
                <label className="sr-only" htmlFor="coach-question">
                  Ask the chess coach a question
                </label>
                <textarea
                  ref={composerRef}
                  id="coach-question"
                  className="composer-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitQuestion(draft);
                    }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder="Ask about this move…"
                  disabled={busy}
                  aria-describedby="composer-help"
                />
                <div className="composer-tools">
                  <button
                    type="button"
                    className={voice.listening ? "mic-button is-listening" : "mic-button"}
                    onClick={startListening}
                    disabled={busy || !voice.supported}
                    aria-pressed={voice.listening}
                    aria-describedby="composer-help"
                  >
                    <span className="mic-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 18v3m-4 0h8" />
                      </svg>
                    </span>
                    {voice.listening ? "Stop listening" : "Ask by voice"}
                  </button>
                  <span id="composer-help" className="composer-help">
                    {!voice.supported
                      ? "Voice input isn't available here. Typing works everywhere."
                      : "Enter sends. Shift and Enter adds a line."}
                  </span>
                  <button type="submit" className="send-button" disabled={busy || !draft.trim()}>
                    Send
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="m4 12 16-8-5 16-3-7-8-1Z" />
                    </svg>
                  </button>
                </div>
              </form>
              <div className="chat-status" role="status" aria-live="polite">
                {voice.listening
                  ? "Listening. Ask your question now."
                  : busy
                    ? "The coach is preparing a reply."
                    : speech.preparing
                      ? `Preparing the ${voiceLabel(voiceId)} voice.`
                      : voice.error
                        ? voice.error
                        : ""}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </div>
    </div>
  );
}
