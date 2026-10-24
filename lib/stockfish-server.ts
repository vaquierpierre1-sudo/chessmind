import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

export type EngineLine = {
  depth: number;
  scoreType: "cp" | "mate";
  score: number;
  pv: string[];
};

export type EngineEvaluation = {
  bestMove?: string;
  ponder?: string;
  line: EngineLine;
  engineName: string;
};

type EngineOptions = {
  skill?: number;
  timeoutMs?: number;
};

function enginePath() {
  return process.env.STOCKFISH_PATH ?? path.join(process.cwd(), "node_modules", "stockfish", "bin", "stockfish-19-lite-single.js");
}

function parseInfo(line: string): EngineLine | null {
  if (!line.startsWith("info ")) return null;
  if (/\b(?:upperbound|lowerbound)\b/.test(line)) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1]);
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/);
  if (!Number.isFinite(depth) || !score || !pv?.length) return null;
  return {
    depth,
    scoreType: score[1] as "cp" | "mate",
    score: Number(score[2]),
    pv,
  };
}

export class StockfishEngine {
  private process: ChildProcessWithoutNullStreams;
  private ready = false;
  private engineName = "Stockfish";
  private collector: ((line: string) => void) | null = null;
  private fatalError: Error | null = null;
  private disposed = false;

  constructor() {
    this.process = spawn(process.execPath, [enginePath()], { stdio: ["pipe", "pipe", "pipe"] });
    const output = readline.createInterface({ input: this.process.stdout });
    output.on("line", (line) => {
      if (line.startsWith("id name ")) this.engineName = line.slice(8).trim();
      this.collector?.(line);
    });
    this.process.stderr.on("data", (chunk: Buffer) => {
      if (process.env.STOCKFISH_DEBUG) console.error("[stockfish]", chunk.toString());
    });
    this.process.on("error", (error) => {
      this.fatalError = error;
    });
    this.process.on("exit", (code) => {
      if (!this.disposed && code !== 0) {
        this.fatalError = new Error(`Stockfish stopped unexpectedly (exit code ${code ?? "unknown"}).`);
      }
    });
  }

  private async waitFor(
    matcher: (line: string) => boolean,
    timeoutMs: number,
    signal?: AbortSignal,
    observe?: (line: string) => void,
  ): Promise<string> {
    if (this.fatalError) throw this.fatalError;
    if (signal?.aborted) throw new Error("Analysis cancelled.");

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.collector = null;
        this.write("stop");
        cleanup();
        reject(new Error("Stockfish timed out while analyzing this position."));
      }, timeoutMs);

      const onAbort = () => {
        this.collector = null;
        this.write("stop");
        cleanup();
        reject(new Error("Analysis cancelled."));
      };

      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (this.collector === handler) this.collector = null;
      };

      const handler = (line: string) => {
        observe?.(line);
        if (matcher(line)) {
          cleanup();
          resolve(line);
        }
      };

      this.collector = handler;
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private write(command: string) {
    if (this.process.stdin.writable) this.process.stdin.write(`${command}\n`);
  }

  async init(options: EngineOptions = {}) {
    const timeout = options.timeoutMs ?? 45_000;
    this.write("uci");
    await this.waitFor((line) => line === "uciok", timeout);
    this.write("setoption name Threads value 1");
    this.write("setoption name Hash value 64");
    if (typeof options.skill === "number") {
      this.write(`setoption name Skill Level value ${Math.max(0, Math.min(20, Math.round(options.skill)))}`);
    }
    this.write("isready");
    await this.waitFor((line) => line === "readyok", timeout);
    this.write("ucinewgame");
    this.ready = true;
    return this.engineName;
  }

  async evaluate(fen: string, depth: number, signal?: AbortSignal, timeoutMs = 30_000): Promise<EngineEvaluation> {
    if (!this.ready) await this.init({ timeoutMs });
    let lastLine: EngineLine | null = null;
    this.write(`position fen ${fen}`);
    this.write(`go depth ${Math.max(4, Math.min(24, Math.round(depth)))}`);
    const bestLine = await this.waitFor(
      (line) => line.startsWith("bestmove"),
      timeoutMs,
      signal,
      (line) => {
        const parsed = parseInfo(line);
        if (parsed) lastLine = parsed;
      },
    );
    if (!lastLine) throw new Error("Stockfish did not return an evaluation for this position.");
    const result = lastLine as EngineLine;
    const match = bestLine.match(/^bestmove (\S+)(?: ponder (\S+))?/);
    return {
      bestMove: match?.[1] && match[1] !== "(none)" ? match[1] : undefined,
      ponder: match?.[2],
      line: result,
      engineName: this.engineName,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.write("quit");
      this.process.stdin.end();
    } catch {
      // The process may already have exited.
    }
    setTimeout(() => {
      if (!this.process.killed) this.process.kill();
    }, 800).unref();
  }
}
