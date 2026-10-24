# ChessMind

A voice-first chess coach for blind and visually impaired players. Import a finished game, let Stockfish find the turning points, then talk through the position with an AI coach that is grounded in the engine's actual analysis.

ChessMind is designed to be fully usable without looking at the screen: every control is keyboard accessible, every position has a text and spoken description, and every answer can be read aloud.

## What it does

- **Import a game** — paste PGN text or choose a `.pgn` file exported from Lichess or Chess.com.
- **Review with Stockfish** — a real Stockfish 19 Lite engine evaluates every position and identifies the player's largest evaluation losses.
- **Hear the turning points** — the three biggest mistakes are shown with the played move, Stockfish's preferred move, the evaluation swing, and the beginning of the engine's line.
- **Talk to the coach** — ask by voice or text. The OpenAI-backed coach receives the exact Stockfish facts for the selected mistake, keeps a conversation history, and streams replies.
- **Play blindfolded** — a real Stockfish opponent replies to moves spoken or typed in natural language, with hints, legal-move lists, full spoken board descriptions, undo, and audio controls.
- **Choose a natural coach voice** — the ElevenLabs **Ramesh** voice, six OpenAI voices, live previews, persisted selection, and automatic fallback to the device voice if cloud speech is unavailable.
- **Use an optional board** — a visual board is available everywhere it matters, but it is never required.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
cd chessmind
npm install
cp .env.example .env.local
```

Add an OpenAI API key to `.env.local`:

```dotenv
OPENAI_API_KEY=sk-...
```

For the default ElevenLabs Ramesh voice, run the official onboarding CLI from the project directory and approve it in the browser:

```bash
npx -y @elevenlabs/cli@latest onboard init
```

The CLI writes `ELEVENLABS_API_KEY` to `.env.local` without exposing it in code. You can also add an ElevenLabs key manually.

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The Stockfish review, blindfold play mode, and all accessibility features work without an OpenAI key. Without a key, the coach screen explains what is missing instead of inventing a conversation.

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | For AI coaching | — | Server-only key for the coach. Never sent to the browser. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Chat model used by the coach. Use a model that supports streaming chat completions. |
| `OPENAI_BASE_URL` | No | OpenAI default | Optional OpenAI-compatible endpoint. |
| `OPENAI_TTS_MODEL` | No | `gpt-4o-mini-tts` | Model used for OpenAI spoken replies. |
| `ELEVENLABS_API_KEY` | For Ramesh's voice | — | Server-only ElevenLabs key. The onboarding CLI can create and store it for you. |
| `ELEVENLABS_TTS_MODEL` | No | `eleven_v4` | ElevenLabs TTS model for the Ramesh voice. |
| `STOCKFISH_DEPTH` | No | `12` | Review depth, clamped to 6–20. Higher is more accurate and slower. |
| `STOCKFISH_PATH` | No | bundled `stockfish` package | Optional path to a Stockfish UCI executable. |

## How the review works

1. `chess.js` parses the PGN, validates every move, and rebuilds each position.
2. A server-side Stockfish process evaluates every position in the game with UCI at the configured depth.
3. For each move made by the selected side, the app compares the player's position evaluation before and after the move, then selects the largest centipawn losses.
4. A move Stockfish itself would have chosen is never counted as a mistake, even if a shallow search produces an inconsistent horizon score.
5. Mistakes are classified as `inaccuracy` (≥50 centipawns), `mistake` (≥150), or `blunder` (≥300). Up to three are shown.
6. Accuracy is an estimate from win-probability changes and is not an official rating. Average loss is also shown. Positions already decided or moves with a forced mate swing are labelled as such rather than presented as precise pawn counts.

The review deliberately errs on the side of showing fewer, evidence-backed mistakes. If the game has no move that loses at least half a pawn from the selected side, the review says so.

## AI grounding

`POST /api/coach` builds a system prompt from the selected mistake and game facts, including:

- the played move and Stockfish's preferred move;
- evaluations before and after, from the player's point of view;
- centipawn loss and classification;
- the engine's principal variation;
- both FENs, a square-by-square position description, and material.

The prompt forbids the model from inventing moves, evaluations, threats, or piece placements. It also asks for plain spoken prose, square coordinates, and no visual-only language. The OpenAI key is read only on the server.

## Accessibility

- Semantic landmarks, headings, fieldsets, labels, and native controls.
- Skip link and focus management when moving between screens.
- Full keyboard operation, visible high-contrast focus rings, and generous targets.
- An explicit **High contrast** mode with stronger borders, pure white/black surfaces, and stronger focus colors.
- Screen-reader text alternatives for stats, evaluations, badges, and the optional visual board.
- A complete square-by-square spoken position description, available as speech and plain text.
- Web Speech API speech-to-text with a persistent text fallback. The microphone button is simply disabled when the browser does not support it.
- ElevenLabs and OpenAI natural speech for coach replies and blindfold announcements, with voice previews, speed and stop controls, per-message **Read aloud**, and automatic device-voice fallback.
- The default **Ramesh** voice from ElevenLabs (Indian English), plus six OpenAI voices and a **Device voice** option for instant, offline speech.
- Live regions announce replies, errors, progress, listening state, and play-by-play when spoken audio is off.
- `prefers-reduced-motion` and `prefers-contrast` support.

### Blindfold voice commands

Moves can be spoken as:

- `e2 to e4`, `e2 e4`, or `e2e4`
- `knight to f3`, `night g1 f3`, or `bishop takes c4`
- `e takes d5`
- `castle kingside`, `castle queenside`, `o-o`, or `o-o-o`
- promotion: `e7 to e8 promote to queen` or `e7 e8 knight`

Commands:

- `describe position`
- `legal moves`
- `hint`
- `undo`
- `repeat`
- `whose turn`
- `audio on` / `audio off`
- `resign` (say twice to confirm)
- `new game`
- `end session`
- `help`

Ambiguous moves are rejected with the legal alternatives, never guessed. Typed input accepts all the same moves and commands.

## Architecture

```
app/
  page.tsx                single-page app shell
  api/analyze/route.ts    streaming NDJSON game analysis
  api/bestmove/route.ts   Stockfish opponent and hint
  api/coach/route.ts      secured OpenAI streaming chat
  api/status/route.ts     coach and voice availability (no secrets)
  api/tts/route.ts        secured ElevenLabs and OpenAI text-to-speech
components/
  ImportScreen.tsx        PGN upload, parsing, analysis progress
  ReviewScreen.tsx        game summary and turning points
  CoachScreen.tsx         voice/text conversation and optional board
  PlayScreen.tsx          blindfold practice room
  ChessBoard.tsx          accessible optional visual board
lib/
  analysis-server.ts      evaluation, accuracy, mistake selection
  stockfish-server.ts     UCI engine process bridge
  chess-utils.ts          PGN parsing and chess helpers
  move-speech.ts          spoken move parser and position descriptions
  voices.ts               shared voice catalog and provider routing
  use-speech.ts           speech recognition and synthesis hooks
  types.ts                shared client/server contracts
```

Stack: Next.js 16, React 19, TypeScript, `chess.js`, `stockfish` (WASM), OpenAI Node SDK, ElevenLabs JavaScript SDK. Stockfish runs in a Node child process on the server; no engine binary is exposed to the browser.

## API

- `POST /api/analyze` — `{ pgn, side }`, streams newline-delimited JSON events: `meta`, `progress`, `result`, `error`.
- `POST /api/bestmove` — `{ fen, depth?, skill? }`, returns a legal Stockfish move.
- `POST /api/coach` — grounded streaming text. Requires `OPENAI_API_KEY`.
- `POST /api/tts` — `{ text, voice, speed }`, returns MP3 audio. Uses `ELEVENLABS_API_KEY` for Ramesh and `OPENAI_API_KEY` for OpenAI voices.
- `GET /api/status` — whether the coach is configured, the model name, and the engine label.

## Testing

```bash
npm test        # spoken-move parser and PGN parsing tests
npm run typecheck
npm run build
```

The test suite covers coordinate moves, SAN, castling, captures, promotion, ambiguity, PGN comments, and position reconstruction.

## Notes and limitations

- Games are held in memory for the request and are not stored. There is no account system or game history.
- The app analyzes completed games; it is not a full chess platform.
- Review time depends on game length and `STOCKFISH_DEPTH`. A long game can take a minute on a small server.
- Browser speech support varies. Chrome and Edge generally provide speech recognition; Safari support differs by version. Text is always available.
- The coach requires an OpenAI key. No fake coaching or analysis is provided without one.
- Natural voices are billed per character by their providers. Every automatic blindfold announcement can trigger a TTS request, so choose **Device voice** if you want instant, zero-cost move announcements.
- The ElevenLabs voice uses the server-only `ELEVENLABS_API_KEY` created by the official onboarding CLI. Do not commit `.env.local`.
- Ramesh is an ElevenLabs **library voice**. ElevenLabs free accounts cannot synthesize library voices through the API; Creator access or API credits are required. ChessMind shows the reason and automatically uses the device voice when this happens.
- Stockfish is licensed under GPL-3.0. The `stockfish` npm package includes the engine and its license. Review that license before redistributing the app.
