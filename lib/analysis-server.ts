import { Chess } from "chess.js";
import { parsePgn, sideToColor, materialBalance, pieceName } from "./chess-utils";
import { StockfishEngine } from "./stockfish-server";
import type { AnalysisMove, GameAnalysis, Mistake, MistakeKind, PlayerSide } from "./types";
import { MATE_SCORE } from "./types";

export type AnalysisProgress = {
  completed: number;
  total: number;
  moveNumber: number;
  color: "w" | "b";
};

type PositionEvaluation = {
  effectiveWhite: number;
  labelWhite: string;
  bestMove?: string;
  pv: string[];
};

export type AnalyzeOptions = {
  depth?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AnalysisProgress) => void;
};

function labelCp(whiteCp: number) {
  if (whiteCp === 0) return "0.0";
  const value = (Math.abs(whiteCp) / 100).toFixed(1);
  return whiteCp > 0 ? `+${value}` : `−${value}`;
}

function labelMate(whiteMate: number, sideToMove: "w" | "b") {
  if (whiteMate === 0) return sideToMove === "w" ? "−M0" : "+M0";
  return whiteMate > 0 ? `+M${whiteMate}` : `−M${Math.abs(whiteMate)}`;
}

function flipLabel(label: string) {
  if (label.startsWith("+")) return `−${label.slice(1)}`;
  if (label.startsWith("−")) return `+${label.slice(1)}`;
  return label;
}

function playerLabel(labelWhite: string, side: PlayerSide) {
  return side === "white" ? labelWhite : flipLabel(labelWhite);
}

function terminalEvaluation(fen: string): PositionEvaluation | null {
  const chess = new Chess(fen);
  const turn = chess.turn();
  if (chess.isCheckmate()) {
    return {
      effectiveWhite: turn === "w" ? -MATE_SCORE : MATE_SCORE,
      labelWhite: turn === "w" ? "−M0" : "+M0",
      pv: [],
    };
  }
  if (chess.isDraw()) {
    return { effectiveWhite: 0, labelWhite: "0.0", pv: [] };
  }
  return null;
}

function winPercent(cp: number) {
  const bounded = Math.max(-10_000, Math.min(10_000, cp));
  return 100 / (1 + Math.exp(-0.00368208 * bounded));
}

function accuracyFromWinChange(before: number, after: number) {
  const drop = Math.max(0, before - after);
  const value = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, value));
}

function uciToSan(fen: string, uci: string) {
  const chess = new Chess(fen);
  try {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    });
    return move.san;
  } catch {
    return null;
  }
}

function pvToSan(fen: string, pv: string[], maxMoves = 6) {
  const chess = new Chess(fen);
  const line: string[] = [];
  for (const uci of pv.slice(0, maxMoves)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
      });
      line.push(move.san);
    } catch {
      break;
    }
  }
  return line;
}

function kindForLoss(cpLoss: number): MistakeKind | null {
  if (cpLoss >= 300) return "blunder";
  if (cpLoss >= 150) return "mistake";
  if (cpLoss >= 50) return "inaccuracy";
  return null;
}

function moveSpeech(move: { piece: string; from: string; to: string; captured?: string; promotion?: string }) {
  const subject = `${pieceName(move.piece).charAt(0).toUpperCase()}${pieceName(move.piece).slice(1)}`;
  const capture = move.captured ? ` captures on ${move.to}` : ` to ${move.to}`;
  const promotion = move.promotion ? `, promoting to ${pieceName(move.promotion)}` : "";
  return `${subject} from ${move.from}${capture}${promotion}.`;
}

function bestSpeech(fen: string, bestMove?: string, fallback = "not recorded.") {
  if (!bestMove) return fallback;
  try {
    const before = new Chess(fen);
    const move = before.move({
      from: bestMove.slice(0, 2),
      to: bestMove.slice(2, 4),
      promotion: bestMove.length > 4 ? bestMove.slice(4, 5) : undefined,
    });
    return `${move.san}.`;
  } catch {
    return `${bestMove.slice(0, 2)} to ${bestMove.slice(2, 4)}.`;
  }
}

type ParsedMove = ReturnType<typeof parsePgn>["game"]["moves"][number];

function buildMoveAnalysis(
  move: ParsedMove,
  before: PositionEvaluation,
  after: PositionEvaluation,
  side: PlayerSide,
  beforeFen: string,
  afterFen: string,
) {
  const playedUci = `${move.from}${move.to}${move.promotion ?? ""}`;
  const bestSan = before.bestMove ? uciToSan(beforeFen, before.bestMove) : null;
  const playedBestMove = Boolean(before.bestMove && (before.bestMove === playedUci || bestSan === move.san));
  const sign = sideToColor(side) === "w" ? 1 : -1;
  const playerBefore = before.effectiveWhite * sign;
  const playerAfter = after.effectiveWhite * sign;
  const rawLoss = playedBestMove ? 0 : Math.max(0, playerBefore - playerAfter);
  const kind = kindForLoss(rawLoss);
  const bestLine = before.bestMove ? pvToSan(beforeFen, before.pv) : [];
  const analysisMove: AnalysisMove = {
    id: `${move.ply}-${move.from}${move.to}`,
    ply: move.ply,
    moveNumber: move.moveNumber,
    color: move.color,
    san: move.san,
    speech: moveSpeech(move),
    uci: playedUci,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured,
    bestSan: bestSan ?? "Unknown",
    bestSpeech: bestSpeech(beforeFen, before.bestMove, bestSan ? `${bestSan}.` : "not recorded."),
    bestUci: before.bestMove ?? "",
    bestLineSan: bestLine.length > 0 ? bestLine : bestSan ? [bestSan] : [],
    cpLoss: Math.min(100_000, Math.round(rawLoss)),
    kind,
    isTurningPoint: Boolean(kind),
    evalBeforeCp: Math.round(before.effectiveWhite),
    evalAfterCp: Math.round(after.effectiveWhite),
    evalBeforeWhite: before.labelWhite,
    evalAfterWhite: after.labelWhite,
    evalBeforePlayer: playerLabel(before.labelWhite, side),
    evalAfterPlayer: playerLabel(after.labelWhite, side),
    fenBefore: beforeFen,
    fenAfter: afterFen,
    materialAfter: materialBalance(afterFen),
  };
  return { analysisMove, rawLoss, kind, bestSan, playedBestMove, bestLine, playerBefore, playerAfter };
}

export async function analyzePgn(pgn: string, side: PlayerSide, options: AnalyzeOptions = {}): Promise<GameAnalysis> {
  const parsed = parsePgn(pgn);
  const { game, positions } = parsed;
  if (game.plyCount > 600) {
    throw new Error("This game has more than 600 half-moves. Choose a shorter game to analyze.");
  }
  const depth = Math.max(6, Math.min(20, Math.round(options.depth ?? (Number(process.env.STOCKFISH_DEPTH) || 12))));
  const playerColor = sideToColor(side);
  const step = 100;

  const engine = new StockfishEngine();
  const cache = new Map<string, PositionEvaluation>();
  const evaluations: PositionEvaluation[] = [];
  let engineName = "Stockfish 19";

  try {
    engineName = await engine.init({ timeoutMs: 45_000 });

    const evaluate = async (fen: string): Promise<PositionEvaluation> => {
      const cached = cache.get(fen);
      if (cached) return cached;
      const terminal = terminalEvaluation(fen);
      if (terminal) {
        cache.set(fen, terminal);
        return terminal;
      }
      const result = await engine.evaluate(fen, depth, options.signal, 35_000);
      const turn = new Chess(fen).turn();
      let effectiveWhite: number;
      let labelWhite: string;
      if (result.line.scoreType === "cp") {
        const signed = turn === "w" ? result.line.score : -result.line.score;
        effectiveWhite = signed;
        labelWhite = labelCp(signed);
      } else {
        const signed = turn === "w" ? result.line.score : -result.line.score;
        effectiveWhite =
          signed === 0
            ? turn === "w"
              ? -MATE_SCORE
              : MATE_SCORE
            : Math.sign(signed) * (MATE_SCORE - Math.abs(signed) * step);
        labelWhite = labelMate(signed, turn);
      }
      const evaluation: PositionEvaluation = {
        effectiveWhite,
        labelWhite,
        bestMove: result.bestMove,
        pv: result.line.pv,
      };
      cache.set(fen, evaluation);
      return evaluation;
    };

    for (let index = 0; index < positions.length; index += 1) {
      if (options.signal?.aborted) throw new Error("Analysis cancelled.");
      evaluations.push(await evaluate(positions[index]));
      const previousMove = index > 0 ? game.moves[index - 1] : undefined;
      options.onProgress?.({
        completed: index + 1,
        total: positions.length,
        moveNumber: previousMove?.moveNumber ?? 0,
        color: previousMove?.color ?? "w",
      });
    }

    const playerMoves = game.moves
      .map((move, index) => ({ move, index }))
      .filter(({ move }) => move.color === playerColor);

    let totalAccuracy = 0;
    let totalLoss = 0;
    const timeline: AnalysisMove[] = [];
    const candidates: Mistake[] = [];

    for (const { move, index } of playerMoves) {
      const before = evaluations[index];
      const after = evaluations[index + 1];
      if (!before || !after) continue;
      const beforeFen = positions[index];
      const afterFen = positions[index + 1];
      if (!beforeFen || !afterFen) continue;

      const result = buildMoveAnalysis(move, before, after, side, beforeFen, afterFen);
      timeline.push(result.analysisMove);

      totalLoss += Math.min(result.rawLoss, 1000);
      totalAccuracy += accuracyFromWinChange(winPercent(result.playerBefore), winPercent(result.playerAfter));

      if (!result.kind || !before.bestMove || !result.bestSan || result.playedBestMove) continue;
      candidates.push({
        ...result.analysisMove,
        bestSan: result.bestSan,
        bestSpeech: bestSpeech(beforeFen, before.bestMove, `${result.bestSan}.`),
        bestUci: before.bestMove,
        bestLineSan: result.bestLine.length > 0 ? result.bestLine : [result.bestSan],
        kind: result.kind,
        isTurningPoint: true,
      });
    }

    candidates.sort((a, b) => b.cpLoss - a.cpLoss || b.ply - a.ply);
    const mistakes = candidates;
    const playerMoveCount = playerMoves.length;
    const accuracy = playerMoveCount > 0 ? Math.round((totalAccuracy / playerMoveCount) * 10) / 10 : 0;
    const acpl = playerMoveCount > 0 ? Math.round(totalLoss / playerMoveCount) : 0;

    return {
      game,
      side,
      accuracy,
      acpl,
      depth,
      engine: `${engineName} · depth ${depth}`,
      analyzedPositions: evaluations.length,
      playerMoveCount,
      timeline,
      mistakes,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    engine.dispose();
  }
}

export type BestMoveOptions = {
  depth?: number;
  skill?: number;
  signal?: AbortSignal;
};

export async function findBestMove(fen: string, options: BestMoveOptions = {}) {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;
  const depth = Math.max(4, Math.min(18, Math.round(options.depth ?? 12)));
  const skill = Math.max(0, Math.min(20, Math.round(options.skill ?? 8)));
  const engine = new StockfishEngine();
  try {
    const name = await engine.init({ skill, timeoutMs: 30_000 });
    const result = await engine.evaluate(fen, depth, options.signal, 30_000);
    if (!result.bestMove) return null;
    const applied = new Chess(fen);
    const move = applied.move({
      from: result.bestMove.slice(0, 2),
      to: result.bestMove.slice(2, 4),
      promotion: result.bestMove.length > 4 ? result.bestMove.slice(4, 5) : undefined,
    });
    return {
      engine: name,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      san: move.san,
      uci: result.bestMove,
      fen: applied.fen(),
      gameOver: applied.isGameOver(),
      result: applied.isCheckmate() ? (move.color === "w" ? "1-0" : "0-1") : applied.isDraw() ? "1/2-1/2" : "*",
      check: applied.inCheck(),
      checkmate: applied.isCheckmate(),
      stalemate: applied.isStalemate(),
      draw: applied.isDraw(),
    };
  } finally {
    engine.dispose();
  }
}
