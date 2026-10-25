import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { buildAnalysisNarration, buildAnalysisSpeech, buildCoachTimelineFacts, buildSelectedMoveSummary } from "../lib/analysis-narration";
import { parsePgn } from "../lib/chess-utils";
import { analyzePgn } from "../lib/analysis-server";

const pgn = `[Event "Test"]\n[White "Ada"]\n[Black "Grace"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;
const parsed = parsePgn(pgn);
assert.equal(parsed.game.plyCount, 10);
assert.equal(parsed.positions.length, 11);

const sampleMove = {
  id: "3-6b5a4",
  ply: 5,
  moveNumber: 3,
  color: "w" as const,
  san: "Bb5",
  speech: "Bishop from f1 to b5.",
  uci: "f1b5",
  from: "f1",
  to: "b5",
  piece: "b",
  bestSan: "Bc4",
  bestSpeech: "Bishop from f1 to c4.",
  bestUci: "f1c4",
  bestLineSan: ["Bc4", "Nf6", "O-O"],
  cpLoss: 120,
  kind: "mistake" as const,
  isTurningPoint: true,
  evalBeforeCp: 60,
  evalAfterCp: -60,
  evalBeforeWhite: "+0.6",
  evalAfterWhite: "−0.6",
  evalBeforePlayer: "+0.6",
  evalAfterPlayer: "−0.6",
  fenBefore: new Chess().fen(),
  fenAfter: new Chess().fen(),
  materialAfter: "Material is level",
};

const standard = buildAnalysisNarration([sampleMove], "standard");
const expert = buildAnalysisNarration([sampleMove], "expert");
assert.match(standard[0].summary, /move 3/i);
assert.match(standard[0].summary, /Stockfish preferred/i);
assert.match(expert[0].summary, /material after/i);
assert.match(expert[0].summary, /line/i);
assert.ok(buildAnalysisSpeech([sampleMove], "standard").length > 20);
assert.match(buildCoachTimelineFacts([sampleMove]), /turning point mistake/);
assert.match(buildSelectedMoveSummary(sampleMove), /loss 120 cp/);

const quietMove = {
  ...sampleMove,
  id: "3-7g8f6",
  san: "Nf6",
  cpLoss: 15,
  kind: null,
  isTurningPoint: false,
  evalBeforePlayer: "+0.4",
  evalAfterPlayer: "+0.3",
};
const quietStandard = buildAnalysisNarration([quietMove], "standard")[0].summary;
const quietExpert = buildAnalysisNarration([quietMove], "expert")[0].summary;
assert.match(quietStandard, /Nothing dramatic changed/i);
assert.match(quietExpert, /quiet/i);
assert.match(buildCoachTimelineFacts([quietMove]), /quiet move/);
assert.match(buildSelectedMoveSummary(quietMove), /quiet move/);

async function main() {
  const result = await analyzePgn(pgn, "white", { depth: 6 });
  assert.ok(result.timeline.length > 0, "analysis should include a timeline");
  assert.equal(result.timeline.length, result.playerMoveCount, "timeline should cover every player move");
  assert.ok(result.timeline.every((move) => typeof move.speech === "string" && move.speech.length > 0), "timeline should include speech for each move");
  assert.ok(
    result.timeline.every((move) => move.bestSan.length > 0 && move.evalBeforePlayer.length > 0),
    "every reviewed move should include engine context",
  );
  assert.ok(result.mistakes.every((move) => move.kind !== null), "key moments should only contain classified moves");
  console.log("All analysis timeline tests passed.");
}

void main();
