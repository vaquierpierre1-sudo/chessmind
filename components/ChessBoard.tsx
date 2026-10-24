"use client";

import { useMemo } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import { describePosition } from "@/lib/move-speech";
import type { PlayerSide } from "@/lib/types";

const GLYPHS: Record<PieceSymbol, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

type ChessBoardProps = {
  fen: string;
  orientation?: PlayerSide;
  lastMove?: { from: string; to: string } | null;
  caption?: string;
};

export function ChessBoard({ fen, orientation = "white", lastMove, caption }: ChessBoardProps) {
  const position = useMemo(() => {
    try {
      const chess = new Chess(fen);
      return { chess, board: chess.board() };
    } catch {
      return null;
    }
  }, [fen]);

  if (!position) {
    return <p className="small-note">This position could not be displayed.</p>;
  }

  const { board } = position;
  const ranks = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const description = describePosition(fen);
  const orientationText = orientation === "white" ? "White at the bottom" : "Black at the bottom";

  return (
    <figure className="board-figure">
      <div
        className="chess-board"
        role="img"
        aria-label={`Chessboard. ${orientationText}. ${description}`}
      >
        <div className="board-grid" aria-hidden="true">
          {ranks.map((rankIndex) =>
            files.map((fileIndex) => {
              const square = board[rankIndex][fileIndex];
              const squareName = `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}` as Square;
              const isLight = (rankIndex + fileIndex) % 2 === 0;
              const isLastFrom = lastMove?.from === squareName;
              const isLastTo = lastMove?.to === squareName;
              const showRank = fileIndex === files[0];
              const showFile = rankIndex === ranks[7];
              return (
                <div
                  key={squareName}
                  className={[
                    "board-square",
                    isLight ? "square-light" : "square-dark",
                    isLastFrom ? "square-last-from" : "",
                    isLastTo ? "square-last-to" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {showRank && <span className="board-coord board-rank">{8 - rankIndex}</span>}
                  {showFile && (
                    <span className="board-coord board-file">{String.fromCharCode(97 + fileIndex)}</span>
                  )}
                  {square && (
                    <span className={`board-piece piece-${square.color}`}>{GLYPHS[square.type]}</span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <figcaption className="board-caption">
        {caption ?? "Visual board"} <span aria-hidden="true">·</span> {orientationText}. A spoken description is
        available from the coach.
      </figcaption>
    </figure>
  );
}
