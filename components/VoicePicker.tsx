"use client";

import { useId } from "react";
import { PROVIDER_LABELS, VOICE_OPTIONS, type VoiceId, type VoiceProvider } from "@/lib/voices";

type VoicePickerProps = {
  value: VoiceId;
  onChange: (voice: VoiceId) => void;
  onPreview: () => void;
  cloudAvailable: boolean | null;
};

export function VoicePicker({ value, onChange, onPreview, cloudAvailable }: VoicePickerProps) {
  const descriptionId = useId();
  const selected = VOICE_OPTIONS.find((voice) => voice.id === value) ?? VOICE_OPTIONS[0];
  return (
    <div className="voice-picker">
      <label className="voice-select-control">
        <span>Voice</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as VoiceId)}
          aria-describedby={descriptionId}
        >
          {(["elevenlabs", "openai", "device"] as VoiceProvider[]).map((provider) => {
            const voices = VOICE_OPTIONS.filter((voice) => voice.provider === provider);
            if (!voices.length) return null;
            return (
              <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      <span id={descriptionId} className="voice-description">
        {selected.description}
      </span>
      <button type="button" className="link-button voice-preview-button" onClick={onPreview}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
        Preview
      </button>
      {cloudAvailable === false && (
        <span className="voice-note">
          Natural voices need OpenAI. Your device voice will be used.
        </span>
      )}
    </div>
  );
}
