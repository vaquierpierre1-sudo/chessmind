import { NextResponse } from "next/server";
import type { CoachStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const openaiTtsConfigured = Boolean(process.env.OPENAI_API_KEY);
  const elevenLabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);
  const status: CoachStatus = {
    coachConfigured: Boolean(process.env.OPENAI_API_KEY),
    ttsConfigured: openaiTtsConfigured || elevenLabsConfigured,
    openaiTtsConfigured,
    elevenLabsConfigured,
    ttsModel: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
    elevenLabsModel: process.env.ELEVENLABS_TTS_MODEL ?? "eleven_v4",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    engine: "Stockfish 19 Lite",
  };
  return NextResponse.json(status);
}
