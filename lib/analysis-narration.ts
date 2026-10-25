import { moveLabel } from "./chess-utils";
import type { AnalysisMode, AnalysisMove } from "./types";

export type AnalysisNarrationEntry = {
  id: string;
  headline: string;
  summary: string;
  speech: string;
  move: AnalysisMove;
};

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function lowerFirst(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return cleaned;
  return `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
}

function evaluationPhrase(label: string) {
  const cleaned = label.replace(/−/g, "-").trim();
  if (!cleaned || cleaned === "0.0") return "about equal";

  const mate = cleaned.match(/^([+-])M(\d+)$/i);
  if (mate) {
    return mate[1] === "+" ? `mate for you in ${mate[2]}` : `mate against you in ${mate[2]}`;
  }

  const score = Number(cleaned);
  if (!Number.isFinite(score)) return cleaned;

  const abs = Math.abs(score);
  if (abs < 0.25) return "about equal";
  if (abs < 0.75) return score > 0 ? "a slight edge for you" : "a slight edge for your opponent";
  if (abs < 1.5) return score > 0 ? "a small edge for you" : "a small edge for your opponent";
  if (abs < 3) return score > 0 ? "a clear edge for you" : "a clear edge for your opponent";
  return score > 0 ? "winning for you" : "winning for your opponent";
}

function lossPhrase(cpLoss: number) {
  if (cpLoss >= 5000) return "a forced-mate swing";
  if (cpLoss === 0) return "no real swing";
  const pawns = cpLoss / 100;
  return `about ${pawns.toFixed(cpLoss >= 1000 ? 0 : 1)} pawns`;
}

function linePhrase(move: AnalysisMove) {
  const line = move.bestLineSan.slice(0, 4).filter(Boolean).join(", ");
  return line || lowerFirst(move.bestSpeech.replace(/\.$/, ""));
}

function openingPhrase(index: number, moveNumber: number, mode: AnalysisMode) {
  if (mode === "expert") {
    const openings = ["On move", "For move", "By move", "Then on move"];
    return `${openings[index % openings.length]} ${moveNumber}`;
  }
  const openings = ["Move", "Then move", "Next move", "Move again"];
  return `${openings[index % openings.length]} ${moveNumber}`;
}

function buildStandardNarration(move: AnalysisMove, index: number) {
  const intro = openingPhrase(index, move.moveNumber, "standard");
  const played = lowerFirst(move.speech.replace(/\.$/, ""));
  const best = lowerFirst(move.bestSpeech.replace(/\.$/, ""));
  const before = evaluationPhrase(move.evalBeforePlayer);
  const after = evaluationPhrase(move.evalAfterPlayer);
  const swing = move.kind ? `That costs ${lossPhrase(move.cpLoss)}.` : "Nothing dramatic changed.";
  return `${intro}: you played ${played}. Stockfish preferred ${best}. The position went from ${before} to ${after}. ${swing}`;
}

function buildExpertNarration(move: AnalysisMove, index: number) {
  const intro = openingPhrase(index, move.moveNumber, "expert");
  const played = lowerFirst(move.speech.replace(/\.$/, ""));
  const best = lowerFirst(move.bestSpeech.replace(/\.$/, ""));
  const before = evaluationPhrase(move.evalBeforePlayer);
  const after = evaluationPhrase(move.evalAfterPlayer);
  const line = linePhrase(move);
  const lastSentence = move.kind
    ? `This is marked as a ${move.kind}, and the loss is ${lossPhrase(move.cpLoss)}.`
    : "This one is quiet, but it still shapes the game.";
  return `${intro}: you played ${played}. Stockfish preferred ${best}, with the line ${line}. The evaluation went from ${before} to ${after}, and material after the move is ${move.materialAfter}. ${lastSentence}`;
}

export function analysisModeLabel(mode: AnalysisMode) {
  return mode === "expert" ? "Expert" : "Standard";
}

export function analysisModeDescription(mode: AnalysisMode) {
  return mode === "expert"
    ? "More detail, more engine context, and a little extra commentary."
    : "Short, clear, and easy to follow.";
}

export function buildAnalysisNarration(timeline: AnalysisMove[], mode: AnalysisMode): AnalysisNarrationEntry[] {
  return timeline.map((move, index) => {
    const summary = mode === "expert" ? buildExpertNarration(move, index) : buildStandardNarration(move, index);
    return {
      id: move.id,
      headline: moveLabel(move.moveNumber, move.color, move.san),
      summary,
      speech: summary,
      move,
    };
  });
}

export function buildAnalysisSpeech(timeline: AnalysisMove[], mode: AnalysisMode) {
  return buildAnalysisNarration(timeline, mode)
    .map((entry) => entry.speech)
    .join(" ");
}

export function buildCoachTimelineFacts(timeline: AnalysisMove[]) {
  return timeline
    .map((move) => {
      const kind = move.kind ? `turning point ${move.kind}` : "quiet move";
      const line = move.bestLineSan.slice(0, 4).join(" ") || move.bestSan;
      return `${moveLabel(move.moveNumber, move.color, move.san)} | played ${cleanText(move.speech).replace(/\.$/, "")} | eval ${move.evalBeforePlayer} -> ${move.evalAfterPlayer} | best ${move.bestSan} (${cleanText(move.bestSpeech).replace(/\.$/, "")}) | line ${line} | loss ${Math.round(move.cpLoss)} cp | ${kind} | material after ${move.materialAfter}.`;
    })
    .join("\n");
}

export function buildSelectedMoveSummary(move: AnalysisMove) {
  return `${moveLabel(move.moveNumber, move.color, move.san)} | played ${cleanText(move.speech).replace(/\.$/, "")} | eval ${move.evalBeforePlayer} -> ${move.evalAfterPlayer} | best ${move.bestSan} (${cleanText(move.bestSpeech).replace(/\.$/, "")}) | line ${move.bestLineSan.slice(0, 4).join(" ") || move.bestSan} | loss ${Math.round(move.cpLoss)} cp | ${move.kind ? `turning point ${move.kind}` : "quiet move"} | material after ${move.materialAfter}.`;
}
