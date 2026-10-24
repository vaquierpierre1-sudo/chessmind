export type OpenAIVoiceId = "sage" | "nova" | "shimmer" | "alloy" | "onyx" | "fable";
export type ElevenLabsVoiceId = "ramesh";
export type VoiceId = OpenAIVoiceId | ElevenLabsVoiceId | "device";
export type VoiceProvider = "elevenlabs" | "openai" | "device";

export type VoiceOption = {
  id: VoiceId;
  label: string;
  description: string;
  provider: VoiceProvider;
  elevenLabsVoiceId?: string;
};

export const ELEVENLABS_RAMESH_ID = "7LIHJn2g4SPvZIQniujs";

export const DEFAULT_VOICE_ID: VoiceId = "ramesh";

export const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "ramesh",
    label: "Ramesh",
    description: "Indian English · warm and conversational",
    provider: "elevenlabs",
    elevenLabsVoiceId: ELEVENLABS_RAMESH_ID,
  },
  { id: "sage", label: "Sage", description: "Warm and unhurried", provider: "openai" },
  { id: "nova", label: "Nova", description: "Bright and clear", provider: "openai" },
  { id: "shimmer", label: "Shimmer", description: "Soft and gentle", provider: "openai" },
  { id: "alloy", label: "Alloy", description: "Neutral and balanced", provider: "openai" },
  { id: "onyx", label: "Onyx", description: "Deep and steady", provider: "openai" },
  { id: "fable", label: "Fable", description: "Expressive and articulate", provider: "openai" },
  { id: "device", label: "Device voice", description: "Your browser’s voice, instantly and offline", provider: "device" },
];

export const PROVIDER_LABELS: Record<VoiceProvider, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  device: "Offline",
};

export const OPENAI_VOICE_IDS = VOICE_OPTIONS.filter((voice) => voice.provider === "openai").map(
  (voice) => voice.id as OpenAIVoiceId,
);

export const ELEVENLABS_VOICES = VOICE_OPTIONS.filter((voice) => voice.provider === "elevenlabs");

export const VOICE_PREVIEW_TEXT =
  "Here's how I sound. Let's take this position one square at a time, and find the idea behind the move.";

export const TTS_INSTRUCTIONS =
  "You are a patient chess coach speaking to a blind player. Sound warm, clear, and natural. Use unhurried pacing and precise pronunciation of square names such as f3 and b5. Never sound theatrical or overly cheerful.";

export function isOpenAIVoice(value: unknown): value is OpenAIVoiceId {
  return typeof value === "string" && OPENAI_VOICE_IDS.includes(value as OpenAIVoiceId);
}

export function isElevenLabsVoice(value: unknown): value is ElevenLabsVoiceId {
  return value === "ramesh";
}

export function getElevenLabsVoice(value: unknown) {
  return VOICE_OPTIONS.find((voice) => voice.provider === "elevenlabs" && voice.id === value) ?? null;
}

export function normalizeVoiceId(value: unknown): VoiceId {
  return typeof value === "string" && VOICE_OPTIONS.some((voice) => voice.id === value)
    ? (value as VoiceId)
    : DEFAULT_VOICE_ID;
}

export function voiceLabel(id: VoiceId) {
  return VOICE_OPTIONS.find((voice) => voice.id === id)?.label ?? "Ramesh";
}
