import { Chess, type Move } from "chess.js";
import { materialBalance, pieceName } from "./chess-utils";

export type SpokenMoveResult =
  | { ok: true; from: string; to: string; promotion?: string; san: string; speech: string }
  | { ok: false; message: string; candidates?: string[] };

const PIECE_WORDS: Record<string, string> = {
  king: "k",
  queen: "q",
  rook: "r",
  castle: "r",
  bishop: "b",
  knight: "n",
  night: "n",
  horse: "n",
  pawn: "p",
};

const PIECE_LETTERS: Record<string, string> = {
  k: "K",
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
  p: "",
};

function normalizeInput(input: string) {
  return input
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,!?;:]/g, " ")
    .replace(/\bcheckmate\b|\bcheck\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function moveSpeech(move: Move) {
  const suffix = move.san.includes("#") ? ", checkmate" : move.san.includes("+") ? ", check" : "";
  if (move.san === "O-O") return `castles kingside${suffix}`;
  if (move.san === "O-O-O") return `castles queenside${suffix}`;
  const name = pieceName(move.piece);
  const subject = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const capture = move.captured ? ` captures on ${move.to}` : ` to ${move.to}`;
  const promotion = move.promotion ? `, promoting to ${pieceName(move.promotion)}` : "";
  return `${subject} from ${move.from}${capture}${promotion}${suffix}`;
}

export function moveToSpeech(move: Move) {
  const base = moveSpeech(move);
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}.`;
}

function trySan(chess: Chess, candidate: string): Move | null {
  const clone = new Chess(chess.fen());
  try {
    return clone.move(candidate, { strict: false });
  } catch {
    return null;
  }
}

function promotionChoice(input: string): string | undefined {
  const words: Record<string, string> = { queen: "q", rook: "r", bishop: "b", knight: "n" };
  const explicit = input.match(/(?:promote|promotion|becomes?|to)\s+(?:a\s+)?(queen|rook|bishop|knight)\b/);
  const trailing = input.match(/\b(queen|rook|bishop|knight)\b/);
  const short = input.match(/=?\s*([qrbn])\b/);
  return words[explicit?.[1] ?? trailing?.[1] ?? ""] ?? short?.[1];
}

function castlingMove(chess: Chess, input: string): Move | null {
  const kingside = /(?:^|\b)(?:castle|castles)\s+(?:king\s*side|short)(?:\b|$)/.test(input) ||
    /(?:^|\b)(?:short\s+castle|king\s*side\s+castle)(?:\b|$)/.test(input) ||
    /\bo-o\b/.test(input) || /\b0-0\b/.test(input);
  const queenside = /(?:^|\b)(?:castle|castles)\s+(?:queen\s*side|long)(?:\b|$)/.test(input) ||
    /(?:^|\b)(?:long\s+castle|queen\s*side\s+castle)(?:\b|$)/.test(input) ||
    /\bo-o-o\b/.test(input) || /\b0-0-0\b/.test(input);
  if (queenside) return trySan(chess, "O-O-O");
  if (kingside) return trySan(chess, "O-O");
  return null;
}

function fromSquares(chess: Chess, from: string, to: string, promotion?: string): SpokenMoveResult {
  const legal = chess.moves({ verbose: true }).filter((move) => move.from === from && move.to === to);
  if (legal.length === 0) {
    return {
      ok: false,
      message: `There is no legal move from ${from} to ${to} in this position.`,
    };
  }
  let chosen = legal[0];
  if (legal.length > 1) {
    const wants = promotion ?? "q";
    chosen = legal.find((move) => move.promotion === wants) ?? legal[0];
  }
  const clone = new Chess(chess.fen());
  const applied = clone.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion });
  return {
    ok: true,
    from: applied.from,
    to: applied.to,
    promotion: applied.promotion,
    san: applied.san,
    speech: moveToSpeech(applied),
  };
}

export function resolveSpokenMove(chess: Chess, rawInput: string): SpokenMoveResult {
  const input = normalizeInput(rawInput);
  if (!input) {
    return { ok: false, message: "I didn't hear a move. Try saying, for example, e2 to e4." };
  }

  const castled = castlingMove(chess, input);
  if (castled) {
    return {
      ok: true,
      from: castled.from,
      to: castled.to,
      san: castled.san,
      speech: moveToSpeech(castled),
    };
  }

  const squarePairs = input.match(/\b([a-h][1-8])\b(?:\s*(?:-|to|from)?\s*)\b([a-h][1-8])\b/);
  if (squarePairs) {
    return fromSquares(chess, squarePairs[1], squarePairs[2], promotionChoice(input));
  }

  const legal = chess.moves({ verbose: true });
  const squareMatches = [...input.matchAll(/\b([a-h][1-8])\b/g)].map((match) => match[1]);
  const destination = squareMatches.at(-1);
  const pieceWord = Object.keys(PIECE_WORDS).find((word) => new RegExp(`\\b${word}\\b`).test(input));
  const piece = pieceWord ? PIECE_WORDS[pieceWord] : undefined;
  let ambiguity: { message: string; candidates: string[] } | null = null;

  if (destination) {
    let candidates = legal.filter((move) => move.to === destination);
    if (piece) candidates = candidates.filter((move) => move.piece === piece);

    if (candidates.length === 1) {
      const chosen = candidates[0];
      const clone = new Chess(chess.fen());
      const applied = clone.move({ from: chosen.from, to: chosen.to, promotion: chosen.promotion });
      return {
        ok: true,
        from: applied.from,
        to: applied.to,
        promotion: applied.promotion,
        san: applied.san,
        speech: moveToSpeech(applied),
      };
    }

    if (candidates.length > 1) {
      const labels = candidates.slice(0, 4).map((move) => `${move.san}, from ${move.from}`);
      ambiguity = {
        message: `That could be more than one move: ${labels.join("; ")}. Include the starting square.`,
        candidates: candidates.map((move) => move.san),
      };
    }
  }

  // Try converting a phrase such as "knight takes f3" or "queen h5" to SAN.
  let san = input
    .replace(/\b(?:please|move|the|my|to|from|a|an)\b/g, " ")
    .replace(/\b(?:takes|captures|capture|took)\b/g, " x ")
    .replace(/\b(kingside|queenside|castle|castles)\b/g, " ")
    .replace(/\b(king|queen|rook|bishop|knight|horse|pawn)\b/g, (word) => PIECE_LETTERS[PIECE_WORDS[word]] ?? " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^x\s*/, "")
    .replace(/\s*x\s*/g, "x")
    .replace(/\s+/g, "")
    .replace(/=([qrbn])/i, (_, pieceLetter: string) => `=${pieceLetter.toUpperCase()}`);
  if (san) {
    if (piece && piece !== "p" && /^[kqrbn]/.test(san)) {
      san = san.charAt(0).toUpperCase() + san.slice(1);
    }
    const candidates = san !== san.charAt(0).toUpperCase() + san.slice(1)
      ? [san, san.charAt(0).toUpperCase() + san.slice(1)]
      : [san];
    for (const candidateSan of candidates) {
      const candidate = trySan(chess, candidateSan);
      if (candidate) {
        return {
          ok: true,
          from: candidate.from,
          to: candidate.to,
          promotion: candidate.promotion,
          san: candidate.san,
          speech: moveToSpeech(candidate),
        };
      }
    }
  }

  // A bare destination square is a common way to call a pawn move.
  if (destination && !piece) {
    const candidate = trySan(chess, destination);
    if (candidate) {
      return {
        ok: true,
        from: candidate.from,
        to: candidate.to,
        promotion: candidate.promotion,
        san: candidate.san,
        speech: moveToSpeech(candidate),
      };
    }
  }

  if (ambiguity) return { ok: false, ...ambiguity };

  return {
    ok: false,
    message:
      "I couldn't match that to a legal move. Say the starting and ending squares, for example e2 to e4, or say legal moves.",
  };
}

function piecesOnSquares(fen: string) {
  const chess = new Chess(fen);
  const board = chess.board();
  const groups: Record<string, string[]> = {};
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const square = board[rank][file];
      if (!square) continue;
      const key = `${square.color === "w" ? "White" : "Black"} ${pieceName(square.type)}s`;
      groups[key] ??= [];
      groups[key].push(square.square);
    }
  }
  return groups;
}

export function describePosition(fen: string) {
  const chess = new Chess(fen);
  const groups = piecesOnSquares(fen);
  const order = ["king", "queen", "rook", "bishop", "knight", "pawn"];
  const colorOrder = ["White", "Black"];
  const sections: string[] = [];
  for (const color of colorOrder) {
    const parts: string[] = [];
    for (const piece of order) {
      const squares = groups[`${color} ${piece}s`];
      if (!squares?.length) continue;
      const plural = squares.length > 1 ? `${piece}s` : piece;
      parts.push(`${plural} on ${squares.join(", ")}`);
    }
    sections.push(`${color}: ${parts.join("; ")}.`);
  }

  const turn = chess.turn() === "w" ? "White" : "Black";
  let state = `${turn} to move.`;
  if (chess.isCheckmate()) state = "That position is checkmate.";
  else if (chess.isStalemate()) state = "That position is stalemate.";
  else if (chess.isDraw()) state = "That position is a draw.";
  else if (chess.inCheck()) state = `${turn} is in check. It is ${turn}'s move.`;

  return `${sections.join(" ")} ${state} ${materialBalance(fen)}.`;
}

export function describeBrief(fen: string, side?: "white" | "black") {
  const chess = new Chess(fen);
  const turn = chess.turn() === "w" ? "White" : "Black";
  let state = `${turn} to move. ${materialBalance(fen)}.`;
  if (chess.isCheckmate()) state = "Checkmate. The game is over.";
  else if (chess.isStalemate()) state = "Stalemate. The game is a draw.";
  else if (chess.isDraw()) state = "The game is a draw.";
  else if (chess.inCheck()) state = `${turn} is in check. ${materialBalance(fen)}.`;
  if (side) {
    const yours = side === "white" ? "White" : "Black";
    if (turn === yours) state += " It is your move.";
  }
  return state;
}

export function legalMoveList(fen: string) {
  return new Chess(fen).moves();
}
