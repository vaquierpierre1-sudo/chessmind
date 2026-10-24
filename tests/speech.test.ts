import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { parsePgn } from "../lib/chess-utils";
import { describeBrief, moveToSpeech, resolveSpokenMove } from "../lib/move-speech";
import { splitForSpeech } from "../lib/use-speech";

function move(fen: string, text: string) {
  const game = new Chess(fen);
  const result = resolveSpokenMove(game, text);
  assert.equal(result.ok, true, `${text}: ${result.ok ? "" : result.message}`);
  if (!result.ok) throw new Error("unreachable");
  game.move({ from: result.from, to: result.to, promotion: result.promotion });
  return { game, result };
}

const start = new Chess().fen();

const e4 = move(start, "e2 to e4");
assert.equal(e4.result.san, "e4");
assert.match(moveToSpeech(e4.game.history({ verbose: true })[0]), /Pawn from e2 to e4/);

assert.equal(move(start, "e4").result.san, "e4");
assert.equal(move(start, "pawn to e4").result.san, "e4");
assert.equal(move(start, "knight to f3").result.san, "Nf3");
assert.equal(move(start, "night g1 f3").result.san, "Nf3");
assert.equal(move(start, "g1 to f3").result.san, "Nf3");
assert.equal(resolveSpokenMove(new Chess(start), "castle kingside").ok, false, "castling should be illegal at the start");

const castles = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
assert.equal(move(castles.fen(), "castle kingside").result.san, "O-O");
assert.equal(move(castles.fen(), "castle queenside").result.san, "O-O-O");
assert.equal(move(castles.fen(), "o-o-o").result.san, "O-O-O");

const capture = new Chess("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2");
assert.equal(move(capture.fen(), "e takes d5").result.san, "exd5");
assert.equal(move(capture.fen(), "e4 to d5").result.san, "exd5");

const promotion = new Chess("8/4P3/8/8/8/8/8/4K2k w - - 0 1");
assert.equal(move(promotion.fen(), "e7 to e8 promote to queen").result.san, "e8=Q");
assert.equal(move(promotion.fen(), "e7 e8 knight").result.san, "e8=N");

const ambiguous = new Chess("4k3/8/8/8/4K3/8/8/R6R w - - 0 1");
const amb = resolveSpokenMove(ambiguous, "rook to d1");
assert.equal(amb.ok, false);
if (!amb.ok) assert.match(amb.message, /Include the starting square/);
assert.equal(move(ambiguous.fen(), "Rad1").result.san, "Rad1");

const pgn = `[Event "Test"]\n[White "Ada"]\n[Black "Grace"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:09:58]} e5 2. Nf3 {A comment} Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;
const parsed = parsePgn(pgn);
assert.equal(parsed.game.white, "Ada");
assert.equal(parsed.game.plyCount, 10);
assert.equal(parsed.positions.length, 11);
assert.match(describeBrief(parsed.game.finalFen), /White to move/);

const chunks = splitForSpeech(
  "Your move Qe6 gave up about 1.4 pawns of evaluation. Stockfish preferred Qb4, keeping the queen on a square that eyes b2 and supports the center. Before moving a queen, check whether the new square leaves a piece undefended. What changed for your knight on f6 after Qe6?",
);
assert.ok(chunks.length >= 2, "long replies should be split for faster speech");
assert.ok(chunks.every((chunk) => chunk.length <= 260), "speech chunks should stay short");
assert.ok(chunks.some((chunk) => chunk.includes("1.4")), "decimal points must not be split apart");
assert.equal(splitForSpeech("A short reply.").length, 1);

console.log("All speech and PGN tests passed.");
