import { NextResponse } from "next/server";
import OpenAI from "openai";
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { getElevenLabsVoice, isOpenAIVoice, TTS_INSTRUCTIONS } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 3500;

export async function POST(request: Request) {
  let body: { text?: unknown; voice?: unknown; speed?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with text and voice." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.replace(/\u0000/g, "").trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `Text must be ${MAX_CHARS} characters or fewer.` }, { status: 400 });
  }
  const requestedVoice = typeof body.voice === "string" ? body.voice : "";
  const openAiVoice = isOpenAIVoice(body.voice) ? body.voice : null;
  const elevenLabsVoice = getElevenLabsVoice(body.voice);
  if (!openAiVoice && !elevenLabsVoice) {
    return NextResponse.json({ error: "Choose a valid voice." }, { status: 400 });
  }

  const speed = Math.max(0.7, Math.min(1.5, Number(body.speed) || 1));

  try {
    let audio: Buffer = Buffer.alloc(0);
    if (elevenLabsVoice) {
      if (!process.env.ELEVENLABS_API_KEY) {
        return NextResponse.json(
          { error: "ElevenLabs voice is not configured. Device speech will be used instead." },
          { status: 503 },
        );
      }
      const elevenLabs = new ElevenLabsClient();
      const elevenLabsModel = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_v4";
      const isV4 = elevenLabsModel.startsWith("eleven_v4");
      const stream = await elevenLabs.textToSpeech.convert(elevenLabsVoice.elevenLabsVoiceId!, {
        text,
        modelId: elevenLabsModel,
        languageCode: "en",
        outputFormat: "mp3_44100_128",
        ...(isV4
          ? {}
          : {
              optimizeStreamingLatency: 2,
              applyTextNormalization: "on" as const,
            }),
        voiceSettings: {
          stability: 0.45,
          similarityBoost: 0.75,
          ...(isV4 ? {} : { useSpeakerBoost: true }),
        },
      });
      audio = Buffer.from(await new Response(stream).arrayBuffer());
      if (audio.length === 0) throw new Error("ElevenLabs returned an empty audio file.");
    } else if (openAiVoice) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "OpenAI voice is not configured. Device speech will be used instead." },
          { status: 503 },
        );
      }
      const model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
      const client = new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
      const speech = await client.audio.speech.create(
        {
          model,
          voice: openAiVoice,
          input: text,
          response_format: "mp3",
          speed,
          ...(model.includes("gpt-4o") ? { instructions: TTS_INSTRUCTIONS } : {}),
        },
        { signal: request.signal },
      );
      audio = Buffer.from(await speech.arrayBuffer());
      if (audio.length === 0) throw new Error("OpenAI returned an empty audio file.");
    }

    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, no-store",
        "X-ChessMind-Voice": requestedVoice,
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    if (error instanceof ElevenLabsError && error.statusCode === 402) {
      return NextResponse.json(
        {
          error:
            "The Ramesh voice is an ElevenLabs library voice. Your ElevenLabs plan needs Creator access or API credits to use it. Choose another voice, or add credits at elevenlabs.io/app/subscription/api.",
          code: "elevenlabs_payment_required",
        },
        { status: 402 },
      );
    }
    if (error instanceof ElevenLabsError && error.statusCode === 401) {
      return NextResponse.json(
        { error: "The ElevenLabs API key was rejected. Re-run the ElevenLabs onboarding or update ELEVENLABS_API_KEY." },
        { status: 401 },
      );
    }
    const message = error instanceof Error ? error.message : "Speech generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
