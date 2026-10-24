import { NextResponse } from "next/server";
import { parsePgn } from "@/lib/chess-utils";
import { analyzePgn } from "@/lib/analysis-server";
import type { AnalysisEvent, PlayerSide } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();

function line(event: AnalysisEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  let body: { pgn?: unknown; side?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a PGN and side." }, { status: 400 });
  }

  const pgn = typeof body.pgn === "string" ? body.pgn : "";
  const side: PlayerSide = body.side === "black" ? "black" : body.side === "white" ? "white" : "white";
  if (!pgn.trim()) {
    return NextResponse.json({ error: "Paste a PGN or choose a .pgn file first." }, { status: 400 });
  }
  if (body.side !== "white" && body.side !== "black") {
    return NextResponse.json({ error: "Choose whether you played White or Black." }, { status: 400 });
  }

  let meta;
  try {
    const parsed = parsePgn(pgn);
    meta = parsed.game;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That PGN could not be read." },
      { status: 400 },
    );
  }

  const depth = Math.max(6, Math.min(20, Math.round(Number(process.env.STOCKFISH_DEPTH) || 12)));
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });

  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AnalysisEvent) => {
        if (closed) return;
        try {
          controller.enqueue(line(event));
        } catch {
          closed = true;
        }
      };
      void (async () => {
        try {
          send({ type: "meta", game: meta, totalPositions: meta.plyCount + 1, depth });
          const analysis = await analyzePgn(pgn, side, {
            depth,
            signal: abort.signal,
            onProgress: (progress) => send({ type: "progress", ...progress }),
          });
          send({ type: "result", analysis });
        } catch (error) {
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Stockfish could not analyze this game.",
          });
        } finally {
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // The browser may have already closed the connection.
            }
          }
        }
      })();
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
