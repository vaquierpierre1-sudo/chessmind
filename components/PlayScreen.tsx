"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import { ChessBoard } from "./ChessBoard";
import { materialBalance, sideToColor } from "@/lib/chess-utils";
import {
  describeBrief,
  describePosition,
  legalMoveList,
  moveToSpeech,
  resolveSpokenMove,
} from "@/lib/move-speech";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useSpeech, useSpeechRecognition } from "@/lib/use-speech";
import { VOICE_PREVIEW_TEXT, voiceLabel, type VoiceId } from "@/lib/voices";
import { VoicePicker } from "./VoicePicker";
import type { EngineMove, PlayerSide } from "@/lib/types";

type PlayScreenProps = {
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  voiceId: VoiceId;
  onVoiceChange: (voice: VoiceId) => void;
  ttsConfigured: boolean | null;
  onLeave: () => void;
};

type Difficulty = "gentle" | "club" | "strong";

const DIFFICULTIES: Record<
  Difficulty,
  { label: string; skill: number; depth: number; description: string }
> = {
  gentle: {
    label: "Gentle",
    skill: 2,
    depth: 8,
    description: "Reduced-strength Stockfish. A calm place to learn the coordinates.",
  },
  club: {
    label: "Club",
    skill: 8,
    depth: 11,
    description: "A solid club-level opponent that punishes loose pieces.",
  },
  strong: {
    label: "Strong",
    skill: 15,
    depth: 14,
    description: "A serious test from the full Lite engine.",
  },
};

type HistoryEntry = { san: string; color: "w" | "b" };

function outcomeForGame(game: Chess) {
  if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "Black" : "White";
    return `Checkmate. ${winner} wins.`;
  }
  if (game.isStalemate()) return "Stalemate. The game is a draw.";
  if (game.isDraw()) return "The game is a draw.";
  return null;
}

function actorMoveSentence(actor: "You" | "Stockfish", move: Move) {
  const speech = moveToSpeech(move);
  if (speech.startsWith("Castles kingside")) {
    return `${actor} castled kingside${speech.replace("Castles kingside", "").replace(/\.$/, "")}.`;
  }
  if (speech.startsWith("Castles queenside")) {
    return `${actor} castled queenside${speech.replace("Castles queenside", "").replace(/\.$/, "")}.`;
  }
  return `${actor} played the ${speech.charAt(0).toLowerCase()}${speech.slice(1)}`;
}

function suggestionSentence(move: Move) {
  const speech = moveToSpeech(move);
  if (speech.startsWith("Castles kingside")) return `Stockfish suggests castling kingside${speech.replace("Castles kingside", "").replace(/\.$/, "")}.`;
  if (speech.startsWith("Castles queenside")) return `Stockfish suggests castling queenside${speech.replace("Castles queenside", "").replace(/\.$/, "")}.`;
  return `Stockfish suggests the ${speech.charAt(0).toLowerCase()}${speech.slice(1)}`;
}

export function PlayScreen({
  speechRate,
  onSpeechRateChange,
  voiceId,
  onVoiceChange,
  ttsConfigured,
  onLeave,
}: PlayScreenProps) {
  const [started, setStarted] = useState(false);
  const [userColor, setUserColor] = useState<PlayerSide>("white");
  const [difficulty, setDifficulty] = useState<Difficulty>("gentle");
  const [fen, setFen] = useState(() => new Chess().fen());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string; san: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [audioOn, setAudioOn] = usePersistentState("chessmind.playAudio", true);
  const [lastSpoken, setLastSpoken] = useState("");
  const [liveText, setLiveText] = useState("");
  const [confirmResign, setConfirmResign] = useState(false);
  const gameRef = useRef(new Chess());
  const gameIdRef = useRef(0);
  const engineAbortRef = useRef<AbortController | null>(null);
  const hintAbortRef = useRef<AbortController | null>(null);
  const lastAnnouncementRef = useRef("");
  const confirmResignRef = useRef(false);
  const turnHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const speech = useSpeech(speechRate, voiceId, ttsConfigured !== false);
  const audioOnRef = useRef(audioOn);
  const speechRef = useRef(speech);
  audioOnRef.current = audioOn;
  speechRef.current = speech;

  const announce = useCallback((message: string) => {
    lastAnnouncementRef.current = message;
    setLastSpoken(message);
    if (audioOnRef.current) {
      const startedSpeech = speechRef.current.speak(message);
      if (startedSpeech) {
        setLiveText("");
        return;
      }
    }
    setLiveText(message);
  }, []);

  const syncBoard = useCallback((game: Chess, move: Move | null) => {
    setFen(game.fen());
    setHistory(game.history({ verbose: true }).map((entry) => ({ san: entry.san, color: entry.color })));
    setLastMove(move ? { from: move.from, to: move.to, san: move.san } : null);
  }, []);

  const requestComputerMove = useCallback(
    async (
      game: Chess,
      color: PlayerSide,
      config: (typeof DIFFICULTIES)[Difficulty],
      gameId: number,
      userMoveSpeech?: string,
    ) => {
      engineAbortRef.current?.abort();
      const controller = new AbortController();
      engineAbortRef.current = controller;
      setThinking(true);
      setError(null);
      try {
        const response = await fetch("/api/bestmove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen: game.fen(), depth: config.depth, skill: config.skill }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Stockfish could not choose a move.");
        }
        const moveData = (await response.json()) as EngineMove;
        if (gameId !== gameIdRef.current || controller.signal.aborted) return;
        const applied = game.move({
          from: moveData.from,
          to: moveData.to,
          promotion: moveData.promotion,
        });
        syncBoard(game, applied);
        const outcome = outcomeForGame(game);
        const computerSpeech = actorMoveSentence("Stockfish", applied);
        if (outcome) {
          setGameOver(outcome);
          announce(`${userMoveSpeech ? `${userMoveSpeech} ` : ""}${computerSpeech} ${outcome}`);
        } else {
          announce(
            `${userMoveSpeech ? `${userMoveSpeech} ` : ""}${computerSpeech} ${describeBrief(game.fen(), color)}`,
          );
        }
        setCommandError(null);
      } catch (requestError) {
        if (controller.signal.aborted || gameId !== gameIdRef.current) return;
        const message =
          requestError instanceof Error ? requestError.message : "Stockfish could not choose a move.";
        setError(message);
        announce(
          `${userMoveSpeech ? `${userMoveSpeech} ` : ""}Stockfish could not complete its move. Use the retry button, or start a new game.`,
        );
      } finally {
        if (gameId === gameIdRef.current) setThinking(false);
      }
    },
    [announce, syncBoard],
  );

  const beginGame = useCallback(
    (color: PlayerSide, config: (typeof DIFFICULTIES)[Difficulty], announceStart: boolean) => {
      engineAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      const id = ++gameIdRef.current;
      const game = new Chess();
      gameRef.current = game;
      setStarted(true);
      setUserColor(color);
      syncBoard(game, null);
      setThinking(false);
      setHintLoading(false);
      setGameOver(null);
      setError(null);
      setCommandError(null);
      setInput("");
      setLastSpoken("");
      setConfirmResign(false);
      confirmResignRef.current = false;
      if (!announceStart) return;
      if (color === "white") {
        announce("New blindfold game. You are White. The board starts in the standard position. It is your move.");
      } else {
        announce("New blindfold game. You are Black. Stockfish moves first.");
        void requestComputerMove(game, color, config, id);
      }
    },
    [announce, requestComputerMove, syncBoard],
  );

  const startGame = () => {
    beginGame(userColor, DIFFICULTIES[difficulty], true);
  };

  const undoMove = useCallback(() => {
    if (thinking || hintLoading) {
      announce("Please wait for Stockfish to finish.");
      return;
    }
    const game = gameRef.current;
    const color = sideToColor(userColor);
    const hasPlayerMove = game.history({ verbose: true }).some((entry) => entry.color === color);
    if (!hasPlayerMove) {
      announce("There is no move of yours to take back yet.");
      return;
    }
    engineAbortRef.current?.abort();
    let undonePlayerMove = false;
    while (game.history().length > 0) {
      const undone = game.undo();
      if (undone?.color === color) {
        undonePlayerMove = true;
        break;
      }
    }
    if (!undonePlayerMove) {
      announce("There was no move to take back.");
      return;
    }
    setGameOver(null);
    setError(null);
    setCommandError(null);
    setConfirmResign(false);
    confirmResignRef.current = false;
    syncBoard(game, null);
    announce(`Took back your last move. ${describeBrief(game.fen(), userColor)}`);
  }, [announce, hintLoading, syncBoard, thinking, userColor]);

  const requestHint = useCallback(async () => {
    if (thinking || hintLoading) return;
    const game = gameRef.current;
    if (game.isGameOver()) {
      announce("The game is over. Start a new game to keep practicing.");
      return;
    }
    if (game.turn() !== sideToColor(userColor)) {
      announce("It is Stockfish's turn. Please wait.");
      return;
    }
    hintAbortRef.current?.abort();
    const controller = new AbortController();
    hintAbortRef.current = controller;
    setHintLoading(true);
    setCommandError(null);
    announce("Finding a hint from Stockfish.");
    try {
      const response = await fetch("/api/bestmove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: game.fen(),
          depth: Math.max(12, DIFFICULTIES[difficulty].depth),
          skill: 20,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Stockfish could not find a hint.");
      const data = (await response.json()) as EngineMove;
      if (controller.signal.aborted) return;
      const legal = game
        .moves({ verbose: true })
        .find(
          (move) =>
            move.from === data.from &&
            move.to === data.to &&
            (move.promotion ?? undefined) === (data.promotion ?? undefined),
        );
      if (legal) {
        announce(`Hint. ${suggestionSentence(legal)}`);
      } else {
        announce(`Stockfish suggests ${data.san}.`);
      }
    } catch (hintError) {
      if (controller.signal.aborted) return;
      const message = hintError instanceof Error ? hintError.message : "A hint is unavailable right now.";
      setCommandError(message);
      announce(message);
    } finally {
      if (!controller.signal.aborted) setHintLoading(false);
    }
  }, [announce, difficulty, hintLoading, thinking, userColor]);

  const endSession = useCallback(() => {
    engineAbortRef.current?.abort();
    hintAbortRef.current?.abort();
    gameIdRef.current += 1;
    speechRef.current.cancel();
    setStarted(false);
    setThinking(false);
    setHintLoading(false);
    setLiveText("");
  }, []);

  const resign = useCallback(() => {
    if (gameOver) {
      announce("The game is already over.");
      return;
    }
    if (!confirmResignRef.current) {
      confirmResignRef.current = true;
      setConfirmResign(true);
      announce("Say resign again to confirm. Or keep playing.");
      return;
    }
    confirmResignRef.current = false;
    setConfirmResign(false);
    const message = "You resigned. The game is over.";
    setGameOver(message);
    announce(message);
  }, [announce, gameOver]);

  const toggleAudio = useCallback(
    (next: boolean) => {
      setAudioOn(next);
      if (!next) {
        speechRef.current.cancel();
        setLiveText("Audio is off. Moves and answers will appear as text.");
        setLastSpoken("Audio is off. Moves and answers will appear as text.");
      } else {
        setLiveText("");
        const message = "Audio is on.";
        lastAnnouncementRef.current = message;
        setLastSpoken(message);
        speechRef.current.speak(message);
      }
    },
    [setAudioOn],
  );

  const handleInput = useCallback(
    async (raw: string) => {
      const rawText = raw.trim();
      if (!rawText) return;
      const normalized = rawText
        .toLowerCase()
        .replace(/[.!?]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      setCommandError(null);
      setInput("");

      if (/^(help|commands|what can i say)$/.test(normalized)) {
        announce(
          "You can say moves like e2 to e4, knight to f3, or castle kingside. Commands are: describe position, legal moves, hint, undo, repeat, whose turn, audio on, audio off, resign, new game, and end session. You can also type any of these.",
        );
        return;
      }
      if (/^(repeat|say that again|again)$/.test(normalized)) {
        announce(lastAnnouncementRef.current || "There is nothing to repeat yet.");
        return;
      }
      if (/^(describe|describe (the )?(board|position)|what is the position|whats the position)$/.test(normalized)) {
        if (!started) return;
        announce(describePosition(gameRef.current.fen()));
        return;
      }
      if (/^(legal moves|what are my moves|list moves)$/.test(normalized)) {
        if (!started) return;
        if (thinking) {
          announce("Stockfish is still thinking. Please wait.");
          return;
        }
        if (gameRef.current.turn() !== sideToColor(userColor)) {
          announce("It is Stockfish's turn. Please wait.");
          return;
        }
        const moves = legalMoveList(gameRef.current.fen());
        announce(moves.length ? `Legal moves: ${moves.join(", ")}.` : "There are no legal moves.");
        return;
      }
      if (/^(whose turn|who's turn|turn)$/.test(normalized)) {
        if (!started) return;
        announce(describeBrief(gameRef.current.fen(), userColor));
        return;
      }
      if (/^(hint|give me a hint|suggest a move)$/.test(normalized)) {
        if (!started) return;
        void requestHint();
        return;
      }
      if (/^(undo|take back|takeback)$/.test(normalized)) {
        if (!started) return;
        undoMove();
        return;
      }
      if (/^(resign)$/.test(normalized)) {
        if (!started) return;
        resign();
        return;
      }
      if (/^(new game|start over|restart)$/.test(normalized)) {
        if (!started) {
          startGame();
        } else {
          beginGame(userColor, DIFFICULTIES[difficulty], true);
        }
        return;
      }
      if (/^(end session|stop session|quit|leave)$/.test(normalized)) {
        endSession();
        return;
      }
      if (/^(audio off|voice off|sound off|mute)$/.test(normalized)) {
        toggleAudio(false);
        return;
      }
      if (/^(audio on|voice on|sound on|unmute)$/.test(normalized)) {
        toggleAudio(true);
        return;
      }

      if (!started) return;
      if (thinking || hintLoading) {
        announce("Stockfish is still thinking. Please wait, or say new game.");
        return;
      }
      if (gameOver) {
        announce(`${gameOver} Say new game to play again.`);
        return;
      }
      const game = gameRef.current;
      if (game.turn() !== sideToColor(userColor)) {
        announce("It is Stockfish's turn. Please wait.");
        return;
      }
      if (confirmResignRef.current) {
        confirmResignRef.current = false;
        setConfirmResign(false);
      }
      const resolved = resolveSpokenMove(game, rawText);
      if (!resolved.ok) {
        setCommandError(resolved.message);
        announce(resolved.message);
        inputRef.current?.focus();
        return;
      }
      let applied: Move;
      try {
        applied = game.move({ from: resolved.from, to: resolved.to, promotion: resolved.promotion });
      } catch {
        const message = "That move could not be played. Please try again.";
        setCommandError(message);
        announce(message);
        return;
      }
      setError(null);
      syncBoard(game, applied);
      const userSpeech = actorMoveSentence("You", applied);
      const outcome = outcomeForGame(game);
      if (outcome) {
        setGameOver(outcome);
        announce(`${userSpeech} ${outcome}`);
        return;
      }
      await requestComputerMove(
        game,
        userColor,
        DIFFICULTIES[difficulty],
        gameIdRef.current,
        userSpeech,
      );
    },
    [
      announce,
      beginGame,
      difficulty,
      endSession,
      gameOver,
      hintLoading,
      requestComputerMove,
      requestHint,
      resign,
      started,
      syncBoard,
      thinking,
      toggleAudio,
      undoMove,
      userColor,
    ],
  );

  const handleTranscript = useCallback(
    (transcript: string) => {
      speechRef.current.cancel();
      void handleInput(transcript);
    },
    [handleInput],
  );

  const voice = useSpeechRecognition(handleTranscript);
  const turn = new Chess(fen).turn();
  const userTurn = turn === sideToColor(userColor);
  const outcome = gameOver;

  const submit = (text: string) => {
    if (voice.listening) voice.stop();
    void handleInput(text);
  };

  const previewVoice = () => {
    if (!speech.supported) {
      setLiveText("Spoken audio is not available in this browser.");
      return;
    }
    speech.speak(VOICE_PREVIEW_TEXT);
    setLiveText(`Previewing the ${voiceLabel(voiceId)} voice.`);
  };

  const startListening = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    speech.cancel();
    voice.start();
  };

  useEffect(() => {
    if (voice.error) {
      setCommandError(voice.error);
      setLiveText(voice.error);
    }
  }, [voice.error]);

  useEffect(() => {
    return () => {
      engineAbortRef.current?.abort();
      hintAbortRef.current?.abort();
      gameIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    const timer = window.setTimeout(() => turnHeadingRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [started]);

  const retryEngine = () => {
    const game = gameRef.current;
    if (game.isGameOver() || game.turn() === sideToColor(userColor)) return;
    void requestComputerMove(game, userColor, DIFFICULTIES[difficulty], gameIdRef.current);
  };

  const speakerToggle = (
    <label className="switch-label">
      <input type="checkbox" checked={audioOn} onChange={(event) => toggleAudio(event.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span />
      </span>
      Speak moves
    </label>
  );

  if (!started) {
    return (
      <div className="screen play-screen">
        <header className="screen-heading-row">
          <div>
            <p className="eyebrow">Blindfold mode</p>
            <h1 id="play-heading" tabIndex={-1}>
              Play with{" "}
              <br />
              <em>your ears.</em>
            </h1>
            <p className="lede">
              A real Stockfish opponent, no board required. Say your move and hear the reply. Coordinates
              become your board.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={onLeave}>
            Back to import
          </button>
        </header>

        <div className="play-setup-grid">
          <section className="play-setup-card" aria-labelledby="play-setup-heading">
            <p className="panel-kicker">Practice room</p>
            <h2 id="play-setup-heading">Set up a blindfold game</h2>

            <fieldset className="field-group">
              <legend className="field-label">Your color</legend>
              <div className="segmented-control">
                <label>
                  <input
                    type="radio"
                    name="play-side"
                    checked={userColor === "white"}
                    onChange={() => setUserColor("white")}
                  />
                  <span>
                    <span className="piece-swatch swatch-white" aria-hidden="true">♔</span>
                    White
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="play-side"
                    checked={userColor === "black"}
                    onChange={() => setUserColor("black")}
                  />
                  <span>
                    <span className="piece-swatch swatch-black" aria-hidden="true">♚</span>
                    Black
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="field-group">
              <legend className="field-label">Opponent strength</legend>
              <div className="difficulty-options">
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map((key) => {
                  const option = DIFFICULTIES[key];
                  return (
                    <label key={key} className={difficulty === key ? "difficulty-option is-selected" : "difficulty-option"}>
                      <input
                        type="radio"
                        name="difficulty"
                        checked={difficulty === key}
                        onChange={() => setDifficulty(key)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="voice-settings setup-voice">
              {speech.supported ? (
                <>
                  {speakerToggle}
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
                </>
              ) : (
                <span className="small-note">
                  Spoken audio isn’t available in this browser. Moves will appear as text.
                </span>
              )}
            </div>

            <button type="button" className="primary-button start-button" onClick={startGame}>
              Start blindfold game
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h14m-5-5 5 5-5 5" />
              </svg>
            </button>
            <p className="small-note">
              {voice.supported
                ? "Microphone access is requested when you first speak. You can always type instead."
                : "Voice input isn't available in this browser. You can still play by typing moves."}
            </p>
            {ttsConfigured !== false && (
              <p className="small-note">
                Natural voices are generated online and may add a short pause. Device voice is instant.
              </p>
            )}
          </section>

          <aside className="play-guide" aria-labelledby="play-guide-heading">
            <h2 id="play-guide-heading">How it works</h2>
            <p>
              You hear every move in plain language and square coordinates. Stockfish replies with a real
              engine move. Nothing is scripted.
            </p>
            <dl className="command-guide">
              <div>
                <dt>Speak a move</dt>
                <dd>“e2 to e4” · “knight to f3” · “castle kingside”</dd>
              </div>
              <div>
                <dt>Check the board</dt>
                <dd>“Describe position” names every piece and square.</dd>
              </div>
              <div>
                <dt>Ask for help</dt>
                <dd>“Legal moves” · “Hint” · “Repeat”</dd>
              </div>
              <div>
                <dt>Control the game</dt>
                <dd>“Undo” · “Resign” · “New game” · “Audio off”</dd>
              </div>
            </dl>
            <p className="access-promise compact-promise">
              <span className="access-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 10v4h3l5 4V6L7 10H4Zm12.5-2.5a6 6 0 0 1 0 9M19 5a10 10 0 0 1 0 14" />
                </svg>
              </span>
              Every move and reply is also available as text.
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="screen play-screen play-active">
      <header className="screen-heading-row play-session-heading">
        <div>
          <p className="eyebrow">Blindfold session</p>
          <h1 id="play-heading" tabIndex={-1}>Play with your ears.</h1>
        </div>
        <div className="session-header-actions">
          <span className="session-mode">
            {userColor === "white" ? "White" : "Black"} · {DIFFICULTIES[difficulty].label}
          </span>
          <button type="button" className="secondary-button" onClick={endSession}>
            End session
          </button>
        </div>
      </header>

      <div className="play-layout">
        <section className="session-stage" aria-labelledby="session-turn-heading">
          <div className="turn-block">
            <span className={outcome ? "turn-kicker is-over" : "turn-kicker"}>
              {outcome
                ? "Game over"
                : hintLoading
                  ? "Stockfish is finding a hint"
                  : thinking
                    ? "Stockfish is thinking"
                    : userTurn
                      ? "Your move"
                      : "Stockfish's turn"}
            </span>
            <h2 id="session-turn-heading" ref={turnHeadingRef} tabIndex={-1}>
              {outcome
                ? outcome
                : thinking
                  ? "Listen for the reply."
                  : userTurn
                    ? "Say your move."
                    : "Give the engine a moment."}
            </h2>
            <p className="turn-detail">
              {lastMove ? (
                <>
                  Last move <strong>{lastMove.san}</strong> · {materialBalance(fen)}
                </>
              ) : (
                <>Starting position · {materialBalance(fen)}</>
              )}
            </p>
          </div>

          {outcome ? (
            <div className="game-over-card">
              <p className="game-over-label">Final position</p>
              <p className="game-over-result">{outcome}</p>
              <div className="game-over-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => beginGame(userColor, DIFFICULTIES[difficulty], true)}
                >
                  New game
                </button>
                <button type="button" className="secondary-button" onClick={endSession}>
                  End session
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={voice.listening ? "listen-orb is-listening" : "listen-orb"}
                onClick={startListening}
                disabled={!voice.supported || thinking || hintLoading}
                aria-pressed={voice.listening}
                aria-describedby="listen-hint"
              >
                <span className="orb-ring" aria-hidden="true" />
                <span className="mic-large" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 18v3m-4 0h8" />
                  </svg>
                </span>
                <strong>
                  {voice.listening
                    ? "Listening"
                    : thinking
                      ? "Stockfish is thinking"
                      : hintLoading
                        ? "Finding a hint"
                        : "Speak a move"}
                </strong>
                <span>
                  {voice.listening
                    ? "Say it now, then pause."
                    : thinking || hintLoading
                      ? "You can type a command below."
                      : voice.supported
                        ? "Tap, then say your move."
                        : "Voice unavailable"}
                </span>
              </button>
              <p id="listen-hint" className="orb-hint">
                {voice.supported
                  ? "You can also type a move or command below."
                  : "Voice input is unavailable here. Type a move or command below."}
              </p>

              <form
                className="play-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit(input);
                }}
              >
                <label className="sr-only" htmlFor="play-input">
                  Type a move or command
                </label>
                <input
                  ref={inputRef}
                  id="play-input"
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit(input);
                    }
                  }}
                  placeholder="Type a move, like e2 to e4"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  aria-describedby="play-input-help"
                />
                <button type="submit" className="send-button" disabled={!input.trim()}>
                  Send
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="m4 12 16-8-5 16-3-7-8-1Z" />
                  </svg>
                </button>
              </form>
              <p id="play-input-help" className="composer-help">
                Enter sends. Say or type “help” for commands.
              </p>
            </>
          )}

          {error && (
            <div className="alert alert-error" role="alert">
              <strong>Stockfish is not responding.</strong>
              <p>{error}</p>
              <button type="button" className="secondary-button compact-button" onClick={retryEngine}>
                Retry Stockfish move
              </button>
            </div>
          )}
          {commandError && (
            <div className="alert alert-soft" role="alert">
              <p>{commandError}</p>
            </div>
          )}
          {confirmResign && !outcome && (
            <p className="resign-warning" role="status">
              Say resign again to confirm.
            </p>
          )}

          {speech.notice && (
            <p className="voice-warning" role="status">
              {speech.notice}
            </p>
          )}
          <div className="voice-settings session-voice">
            {speech.supported ? (
              <>
                {speakerToggle}
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
                  <button type="button" className="link-button" onClick={speech.cancel}>
                    Stop speaking
                  </button>
                )}
                {speech.preparing && (
                  <span className="voice-preparing" role="status">
                    Preparing the {voiceLabel(voiceId)} voice.
                  </span>
                )}
              </>
            ) : (
              <span className="small-note">
                Spoken audio isn’t available; announcements appear as text.
              </span>
            )}
          </div>
        </section>

        <aside className="session-sidebar" aria-label="Session details">
          <div className="sidebar-block">
            <div className="sidebar-heading-row">
              <h2>Move history</h2>
              <button type="button" className="link-button" onClick={() => submit("repeat")}>
                Repeat last
              </button>
            </div>
            {history.length === 0 ? (
              <p className="small-note">No moves yet.</p>
            ) : (
              <ol className="session-history">
                {history.map((entry, index) => (
                  <li key={`${index}-${entry.san}`} className={index === history.length - 1 ? "is-latest" : ""}>
                    <span>
                      {entry.color === "w"
                        ? `${Math.floor(index / 2) + 1}.`
                        : `${Math.floor(index / 2) + 1}...`}
                    </span>
                    <strong>{entry.san}</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="sidebar-block">
            <h2>Quick commands</h2>
            <div className="command-buttons">
              <button type="button" className="command-button" onClick={() => submit("describe position")}>
                Describe position
              </button>
              <button
                type="button"
                className="command-button"
                onClick={() => submit("legal moves")}
                disabled={!userTurn || thinking || Boolean(outcome)}
              >
                Legal moves
              </button>
              <button
                type="button"
                className="command-button"
                onClick={() => submit("hint")}
                disabled={!userTurn || thinking || hintLoading || Boolean(outcome)}
              >
                {hintLoading ? "Finding hint…" : "Hint"}
              </button>
              <button
                type="button"
                className="command-button"
                onClick={() => submit("undo")}
                disabled={thinking || history.length === 0}
              >
                Undo
              </button>
              <button type="button" className="command-button" onClick={() => submit("whose turn")}>
                Whose turn
              </button>
              <button type="button" className="command-button" onClick={() => submit("help")}>
                All commands
              </button>
            </div>
          </div>

          <div className="sidebar-block">
            <button
              type="button"
              className="secondary-button compact-button board-toggle"
              aria-expanded={boardOpen}
              aria-controls="play-board"
              onClick={() => setBoardOpen((open) => !open)}
            >
              {boardOpen ? "Hide visual board" : "Show visual board"}
            </button>
            <div id="play-board" hidden={!boardOpen}>
              {boardOpen && (
                <ChessBoard
                  fen={fen}
                  orientation={userColor}
                  lastMove={lastMove}
                  caption="Current position"
                />
              )}
            </div>
            <p className="small-note blindfold-note">
              The board is optional. The game is designed to be played entirely by ear.
            </p>
          </div>

          {lastSpoken && (
            <div className="sidebar-block last-spoken-block">
              <h2>Last announcement</h2>
              <p>{lastSpoken}</p>
            </div>
          )}

          <details className="command-help">
            <summary>Voice and keyboard help</summary>
            <p>
              Moves can be said as “e2 to e4”, “knight to f3”, “e takes d5”, or “castle queenside”.
              Commands include describe position, legal moves, hint, undo, repeat, resign, new game, audio
              off, and end session. Type anything you can say.
            </p>
            <p>
              To resign, say “resign” twice. To leave the practice room, choose End session. Your moves are
              not saved.
            </p>
          </details>
        </aside>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {liveText}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {voice.listening ? "Listening. Say your move." : ""}
      </div>
    </div>
  );
}
