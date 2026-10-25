export type PlayerSide = "white" | "black";
export type PieceColor = "w" | "b";
export type AnalysisMode = "standard" | "expert";

export type MoveRecord = {
  ply: number;
  moveNumber: number;
  color: PieceColor;
  san: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
};

export type GameSummary = {
  event: string;
  site: string;
  date: string;
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  opening?: string;
  timeControl?: string;
  plyCount: number;
  finalFen: string;
  moves: MoveRecord[];
};

export type ParsedGame = {
  game: GameSummary;
  pgn: string;
  positions: string[];
};

export type MistakeKind = "inaccuracy" | "mistake" | "blunder";

export type AnalysisMove = {
  id: string;
  ply: number;
  moveNumber: number;
  color: PieceColor;
  san: string;
  speech: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  bestSan: string;
  bestSpeech: string;
  bestUci: string;
  bestLineSan: string[];
  cpLoss: number;
  kind: MistakeKind | null;
  isTurningPoint: boolean;
  evalBeforeCp: number;
  evalAfterCp: number;
  evalBeforeWhite: string;
  evalAfterWhite: string;
  evalBeforePlayer: string;
  evalAfterPlayer: string;
  fenBefore: string;
  fenAfter: string;
  materialAfter: string;
};

export type Mistake = Omit<AnalysisMove, "kind" | "isTurningPoint"> & {
  kind: MistakeKind;
  isTurningPoint: true;
};

export type GameAnalysis = {
  game: GameSummary;
  side: PlayerSide;
  accuracy: number;
  acpl: number;
  depth: number;
  engine: string;
  analyzedPositions: number;
  playerMoveCount: number;
  timeline: AnalysisMove[];
  mistakes: Mistake[];
  generatedAt: string;
};

export type AnalysisEvent =
  | { type: "meta"; game: GameSummary; totalPositions: number; depth: number }
  | {
      type: "progress";
      completed: number;
      total: number;
      moveNumber: number;
      color: PieceColor;
    }
  | { type: "result"; analysis: GameAnalysis }
  | { type: "error"; message: string };

export type CoachMessage = {
  role: "user" | "assistant";
  content: string;
  hidden?: boolean;
};

export type EngineMove = {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  uci: string;
  fen: string;
  gameOver: boolean;
  result: string;
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
  draw: boolean;
};

export type CoachStatus = {
  coachConfigured: boolean;
  ttsConfigured: boolean;
  openaiTtsConfigured: boolean;
  elevenLabsConfigured: boolean;
  ttsModel?: string;
  elevenLabsModel?: string;
  model?: string;
  engine: string;
};

export const MATE_SCORE = 100000;
