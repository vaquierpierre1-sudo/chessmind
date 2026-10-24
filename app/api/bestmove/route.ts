import { Chess } from "chess.js";
import { NextResponse } from "next/server";
import { findBestMove } from "@/lib/analysis-server";
import type { EngineMove } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { fen?: unknown; depth?: unknown; skill?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a FEN." }, { status: 400 });
  }

  if (typeof body.fen !== "string" || !body.fen.trim()) {
    return NextResponse.json({ error: "A FEN is required." }, { status: 400 });
  }

  try {
    const chess = new Chess(body.fen);
    if (chess.isGameOver()) {
      return NextResponse.json({ error: "The game is already over." }, { status: 422 });
    }
    const depth = typeof body.depth === "number" ? body.depth : 12;
    const skill = typeof body.skill === "number" ? body.skill : 8;
    const result = await findBestMove(body.fen, { depth, skill, signal: request.signal });
    if (!result) {
      return NextResponse.json({ error: "Stockfish found no legal move." }, { status: 422 });
    }
    return NextResponse.json(result satisfies EngineMove);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stockfish could not find a move." },
      { status: 500 },
    );
  }
}
