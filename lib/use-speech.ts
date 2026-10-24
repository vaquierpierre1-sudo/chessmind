"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOICE_ID, isElevenLabsVoice, type VoiceId } from "./voices";

type RecognitionAlternative = { transcript: string };
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal: boolean };

type RecognitionEventLike = {
  resultIndex?: number;
  results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorLike = { error?: string };

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const withSpeech = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return withSpeech.SpeechRecognition ?? withSpeech.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(onTranscript: (transcript: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()));
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError("Voice input is not available in this browser. You can type your question below.");
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setError(null);
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) transcript += ` ${result[0]?.transcript ?? ""}`;
      }
      transcript = transcript.trim();
      if (transcript) callbackRef.current(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow microphone access in your browser, or type instead.");
      } else if (event.error === "no-speech") {
        setError("I didn't hear anything. Try the microphone again, or type instead.");
      } else if (event.error !== "aborted") {
        setError("Voice input stopped unexpectedly. You can try again or type instead.");
      }
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setError("The microphone could not start. Check microphone permissions, or type instead.");
      setListening(false);
    }
  }, []);

  return { supported, listening, error, setError, start, stop };
}

export function splitForSpeech(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“'(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > 200 && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized];
}

export function useSpeech(rate = 1, voiceId: VoiceId = DEFAULT_VOICE_ID, cloudEnabled = true) {
  const [deviceSupported, setDeviceSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [engine, setEngine] = useState<"openai" | "device" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const cloudEnabledRef = useRef(cloudEnabled);
  const voiceIdRef = useRef(voiceId);
  cloudEnabledRef.current = cloudEnabled;
  voiceIdRef.current = voiceId;

  const supported = deviceSupported || cloudEnabled;

  useEffect(() => {
    setDeviceSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const clearAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sequenceRef.current += 1;
    clearAudio();
    utteranceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setPreparing(false);
    setEngine(null);
  }, [clearAudio]);

  const cancel = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const speakWithDevice = useCallback(
    (text: string, sequence: number) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        if (sequence === sequenceRef.current) {
          setPreparing(false);
          setSpeaking(false);
          setEngine(null);
          setError("Spoken audio is not available in this browser.");
        }
        return false;
      }
      clearAudio();
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = Math.max(0.6, Math.min(1.8, rate));
      utterance.pitch = 1;
      const preferred = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.localService && /^en[-_]US/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;
      utterance.onstart = () => {
        if (sequence !== sequenceRef.current) return;
        setPreparing(false);
        setSpeaking(true);
        setEngine("device");
      };
      utterance.onend = () => {
        if (sequence !== sequenceRef.current) return;
        setSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        if (sequence !== sequenceRef.current) return;
        setSpeaking(false);
        setEngine(null);
        setError("The device voice could not speak this reply.");
        utteranceRef.current = null;
      };
      utteranceRef.current = utterance;
      setPreparing(true);
      setError(null);
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [clearAudio, rate],
  );

  const fetchSpeechChunk = useCallback(
    async (text: string, signal: AbortSignal, voice: VoiceId) => {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice,
          speed: rate,
        }),
        signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Natural speech generation failed.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("Natural speech returned no audio.");
      return blob;
    },
    [rate],
  );

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined") return false;
      const clean = text.replace(/\s+/g, " ").trim();
      if (!clean) return false;

      stopPlayback();
      const sequence = ++sequenceRef.current;
      setError(null);
      setNotice(null);

      const selectedVoice = voiceIdRef.current;
      if (!cloudEnabledRef.current || selectedVoice === "device") {
        return speakWithDevice(clean, sequence);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setPreparing(true);
      setEngine("openai");

      const chunks = splitForSpeech(clean);
      let currentChunk = 0;
      let nextResult: Promise<{ blob: Blob } | { error: unknown }> = fetchSpeechChunk(
        chunks[0],
        controller.signal,
        selectedVoice,
      )
        .then((blob) => ({ blob }))
        .catch((error: unknown) => ({ error }));

      const playBlob = (blob: Blob) =>
        new Promise<"done" | "failed" | "cancelled">((resolve) => {
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audio.preload = "auto";
          audio.preservesPitch = true;
          // Eleven v4 handles pacing inside the voice model, so apply the user's speed during playback.
          audio.playbackRate = isElevenLabsVoice(selectedVoice) ? rate : 1;
          audioRef.current = audio;
          let settled = false;
          const release = () => {
            audio.onplay = null;
            audio.onended = null;
            audio.onerror = null;
            audio.removeEventListener("pause", onPause);
            if (audioRef.current === audio) audioRef.current = null;
            if (audioUrlRef.current === url) audioUrlRef.current = null;
            URL.revokeObjectURL(url);
          };
          const finish = (result: "done" | "failed" | "cancelled") => {
            if (settled) return;
            settled = true;
            release();
            resolve(result);
          };
          const onPause = () => {
            if (sequence !== sequenceRef.current) finish("cancelled");
          };
          audio.addEventListener("pause", onPause);
          audio.onplay = () => {
            if (sequence !== sequenceRef.current) return;
            setPreparing(false);
            setSpeaking(true);
            setEngine("openai");
          };
          audio.onended = () => finish("done");
          audio.onerror = () => finish("failed");
          void audio.play().catch(() => {
            finish(sequence === sequenceRef.current ? "failed" : "cancelled");
          });
        });

      void (async () => {
        try {
          for (let index = 0; index < chunks.length; index += 1) {
            currentChunk = index;
            const result = await nextResult;
            if ("error" in result) throw result.error;
            if (sequence !== sequenceRef.current || controller.signal.aborted) return;

            if (index + 1 < chunks.length) {
              nextResult = fetchSpeechChunk(chunks[index + 1], controller.signal, selectedVoice)
                .then((blob) => ({ blob }))
                .catch((error: unknown) => ({ error }));
            }

            const playback = await playBlob(result.blob);
            if (playback === "cancelled" || sequence !== sequenceRef.current) return;
            if (playback === "failed") throw new Error("The generated audio could not be played.");
          }
          if (sequence === sequenceRef.current) {
            setSpeaking(false);
            setPreparing(false);
            setEngine(null);
          }
        } catch (speechError) {
          if (controller.signal.aborted || sequence !== sequenceRef.current) return;
          clearAudio();
          const remaining = chunks.slice(currentChunk).join(" ").trim() || clean;
          setNotice(
            speechError instanceof Error
              ? speechError.message
              : "Natural voice was unavailable. Using your device voice.",
          );
          const deviceStarted = speakWithDevice(remaining, sequence);
          if (!deviceStarted) {
            setPreparing(false);
            setError(
              speechError instanceof Error
                ? "Natural voice failed, and this browser has no device voice."
                : "Spoken audio is unavailable.",
            );
          }
        }
      })();

      return true;
    },
    [clearAudio, fetchSpeechChunk, rate, speakWithDevice, stopPlayback],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      sequenceRef.current += 1;
      clearAudio();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearAudio]);

  return { supported, speaking, preparing, engine, error, notice, speak, cancel };
}
