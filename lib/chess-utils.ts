import { Chess } from "chess.js";
import type { GameSummary, Mistake, MoveRecord, ParsedGame, PlayerSide } from "./types";

const MOVE_NUMBER = /^\d+\.(?:\.\.)?$/;
const GAME_RESULT = /^(?:1-0|0-1|1\/2-1\/2|\*)$/;

function headerValue(value: string | null | undefined, fallback: string) {
  if (!value || value === "?") return fallback;
  return value;
}

function optionalHeader(value: string | null | undefined) {
  if (!value || value === "?") return undefined;
  return value;
}

function stripCommentsAndVariations(pgn: string) {
  let result = pgn;
  // PGN comments and variations can nest, so strip until stable.
  let previous = "";
  while (previous !== result) {
    previous = result;
    result = result.replace(/\{[^}]*\}/g, " ");
    result = result.replace(/;[^\n]*/g, " ");
    result = result.replace(/\([^()]*\)/g, " ");
    result = result.replace(/\$\d+/g, " ");
  }
  return result;
}

function loadPlainMoves(pgn: string) {
  const text = stripCommentsAndVariations(pgn)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\u00a0/g, " ");
  const tokens = text.split(/\s+/).filter(Boolean);
  const chess = new Chess();
  for (const token of tokens) {
    if (MOVE_NUMBER.test(token) || GAME_RESULT.test(token)) continue;
    if (token === "e.p." || token === "ep") continue;
    try {
      chess.move(token, { strict: false });
    } catch {
      throw new Error(`Could not read the move “${token}”. Check that the PGN is complete and legal.`);
    }
  }
  return chess;
}

function readGame(chess: Chess, pgn: string): ParsedGame {
  const history = chess.history({ verbose: true });
  if (history.length === 0) {
    throw new Error("This PGN does not contain any moves. Export a completed game and try again.");
  }
  const headers = chess.getHeaders();
  const positions = [history[0].before, ...history.map((move) => move.after)];
  const moves: MoveRecord[] = history.map((move, index) => ({
    ply: index + 1,
    moveNumber: Math.floor(index / 2) + 1,
    color: move.color,
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
  }));

  const game: GameSummary = {
    event: headerValue(headers.Event, "Imported game"),
    site: headerValue(headers.Site, ""),
    date: headerValue(headers.Date, ""),
    white: headerValue(headers.White, "White"),
    black: headerValue(headers.Black, "Black"),
    whiteElo: optionalHeader(headers.WhiteElo),
    blackElo: optionalHeader(headers.BlackElo),
    result: headers.Result && headers.Result !== "?" ? headers.Result : "*",
    opening: optionalHeader(headers.Opening),
    timeControl: optionalHeader(headers.TimeControl),
    plyCount: history.length,
    finalFen: chess.fen(),
    moves,
  };
  return { game, pgn, positions };
}

export function parsePgn(pgn: string): ParsedGame {
  const normalized = pgn.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    throw new Error("Paste a PGN or choose a .pgn file to get started.");
  }
  if (normalized.length > 2_000_000) {
    throw new Error("That PGN is too large. Choose a single game under 2 MB.");
  }

  let lastError: unknown;
  try {
    const chess = new Chess();
    chess.loadPgn(normalized);
    return readGame(chess, normalized);
  } catch (error) {
    lastError = error;
  }

  try {
    const chess = new Chess();
    const cleaned = stripCommentsAndVariations(normalized);
    chess.loadPgn(cleaned);
    return readGame(chess, normalized);
  } catch (error) {
    lastError = error;
  }

  try {
    const chess = loadPlainMoves(normalized);
    return readGame(chess, normalized);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Could not read")) throw error;
    lastError = error;
  }

  const detail = lastError instanceof Error ? lastError.message : "Unknown PGN error.";
  throw new Error(`We couldn't read this PGN. ${detail} Try the export from Lichess or Chess.com.`);
}

export function sideToColor(side: PlayerSide): "w" | "b" {
  return side === "white" ? "w" : "b";
}

export function colorToSide(color: "w" | "b"): PlayerSide {
  return color === "w" ? "white" : "black";
}

export function moveLabel(moveNumber: number, color: "w" | "b", san: string) {
  return color === "w" ? `${moveNumber}. ${san}` : `${moveNumber}... ${san}`;
}

export function formatGameDate(date: string) {
  if (!date || date === "????.??.??") return "Date unknown";
  const [year, month, day] = date.split(".");
  if (!year || year === "????") return "Date unknown";
  if (!month || month === "??") return year;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[Number(month) - 1];
  if (!monthName) return year;
  if (!day || day === "??") return `${monthName} ${year}`;
  return `${Number(day)} ${monthName} ${year}`;
}

export function describePgnResult(result: string, white: string, black: string) {
  if (result === "1-0") return `${white} won`;
  if (result === "0-1") return `${black} won`;
  if (result === "1/2-1/2") return "Draw";
  return "Result not recorded";
}

export function pieceName(piece: string) {
  const names: Record<string, string> = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  return names[piece] ?? "piece";
}

export function materialBalance(fen: string) {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const chess = new Chess(fen);
  let white = 0;
  let black = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square || square.type === "k") continue;
      if (square.color === "w") white += values[square.type] ?? 0;
      else black += values[square.type] ?? 0;
    }
  }
  const diff = white - black;
  if (diff === 0) return "Material is level";
  return diff > 0 ? `White is up ${diff} point${diff === 1 ? "" : "s"}` : `Black is up ${-diff} point${diff === -1 ? "" : "s"}`;
}

export function mistakeSummary(mistake: Mistake) {
  const lost = (mistake.cpLoss / 100).toFixed(1);
  const subject = mistake.color === "w" ? "White" : "Black";
  if (mistake.cpLoss >= 5000) {
    if (/^[−-]M/.test(mistake.evalAfterPlayer)) {
      return `${subject}'s ${mistake.san} allowed a forced mate. Stockfish preferred ${mistake.bestSan}.`;
    }
    return `${subject}'s ${mistake.san} caused a decisive evaluation swing. Stockfish preferred ${mistake.bestSan}.`;
  }
  return `${subject}'s ${mistake.san} gave up ${lost} pawns of evaluation compared with Stockfish's ${mistake.bestSan}.`;
}

export function isPlayerTurn(fen: string, side: PlayerSide) {
  return new Chess(fen).turn() === sideToColor(side);
}
