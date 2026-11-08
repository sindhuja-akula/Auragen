# AuraGen — Self-Healing Generative UI

AuraGen is a real-time adaptive UI platform that observes user interaction telemetry, computes a deterministic cognitive load score, and — when the score exceeds a configurable threshold — orchestrates LLM-powered UI generation, AST/security validation, and safe in-browser rendering, all while preserving user form state.

## Architecture

```
Browser (React 19 + Vite)
  │
  ├─ DomTelemetryTracker ── captures repeated clicks, hesitation,
  │                          backtracking, failed attempts
  │
  ├─ TelemetryWebSocketClient ── sends TelemetryEvent over WebSocket
  │
  └─ AdaptiveForm ── renders live cognitive score gauge, pipeline stepper,
                      simulation controls, and either the original or
                      dynamically generated UI via DynamicRenderer

WebSocket Server (Node.js + ws)
  │
  ├─ TelemetryPipeline ── per-session scoring with CognitiveScorer
  │
  ├─ Orchestrator (M1) ── state machine: IDLE → DETECTING →
  │                        ADAPTATION_REQUESTED → GENERATING →
  │                        VALIDATING → APPLYING → COOLDOWN → IDLE
  │
  ├─ LLMGenerator (M3) ── Groq SDK → promptBuilder → llmClient →
  │                        generationValidator → GeneratedUI
  │
  ├─ validateGeneratedUI (M4) ── Babel AST parse + security policy
  │
  └─ jsxCompiler ── transforms JSX → React.createElement
                     (controlled closure, no eval/new Function)

Shared Contracts (shared/contracts/)
  TelemetryEvent · CognitiveScore · RedesignRequest
  GeneratedUI · ValidationResult · AdaptationResult
```

## Quick Start

### Prerequisites

- Node.js ≥ 20
- A Groq API key (https://console.groq.com)

### Setup

```bash
git clone <repo-url> && cd Auragen
npm install
cp .env.example .env
# Edit .env and set GROQ_API_KEY=gsk_...
```

### Run

```bash
# Terminal 1: Start the WebSocket backend
npm run dev:backend

# Terminal 2: Start the Vite frontend dev server
npm run dev:frontend
```

Open `http://localhost:5173` in a browser. The adaptive form UI connects to the WebSocket server on port 3001.

### Test

```bash
npm test          # 70 tests across 12 test files
npm run build     # TypeScript compilation (0 errors)
```

### Scripts

| Script          | Description                              |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Alias for `dev:frontend` (Vite)          |
| `npm run dev:frontend` | Vite dev server (port 5173)       |
| `npm run dev:backend`  | WebSocket server via tsx           |
| `npm run start:ws`     | WebSocket server via tsx (alias)   |
| `npm run build` | TypeScript compilation                   |
| `npm test`      | Vitest test suite                        |

## Project Structure

```
Auragen/
├── backend/
│   ├── generation/       # LLM client, prompt builder, generation validator
│   ├── orchestrator/     # Orchestrator state machine, telemetry pipeline
│   ├── scoring/          # Deterministic cognitive load scorer
│   └── websocket/        # WebSocket server with bidirectional transport
├── frontend/
│   ├── renderer/         # DynamicRenderer, ErrorBoundary, componentLoader
│   ├── state/            # StateManager for form state preservation
│   ├── telemetry/        # DOM tracking, WebSocket client, config
│   ├── AdaptiveForm.tsx  # Main UI component
│   └── styles.css        # Design system (dark theme)
├── shared/contracts/     # Frozen shared type contracts
├── validator/
│   ├── parser/           # Babel parser wrapper
│   ├── validator/        # AST + security policy enforcement
│   └── compiler/         # JSX → React.createElement transformer
├── tests/                # Vitest test suite
├── experiments/          # Performance and security experiments
└── docs/                 # Architecture, decisions, contracts, progress
```

## Security Model

1. **Static AST Validation** — Every LLM-generated code candidate is parsed by Babel and inspected against an explicit security policy. Rejected patterns include `eval`, `Function`, `require`, `fetch`, `WebSocket`, `document.cookie`, `localStorage`, `dangerouslySetInnerHTML`, `<script>`, `<iframe>`, external URLs, and more.

2. **Import Restriction** — Only `import { ... } from 'react'` is allowed. All other module imports are rejected at the AST level.

3. **Controlled Closure Execution** — After AST validation, JSX is compiled to `React.createElement` calls and executed in a closure that shadows sensitive browser globals (`window`, `document`, `globalThis`, `fetch`, `WebSocket`, `localStorage`, etc.) as `undefined`.

4. **Error Boundary** — Runtime errors in rendered components are caught by `ErrorBoundary` and fall back to the existing safe UI.

5. **No Raw Eval** — The system never uses `eval()` or `new Function()` to bypass validation.

## Cognitive Scoring

The scorer maps telemetry events to deterministic difficulty signals:

| Signal             | Weight | Source Event      |
| ------------------ | ------ | ----------------- |
| `repeated_clicks`  | 0.35   | `repeated_click`  |
| `hesitation`       | 0.25   | `hesitation` / `long_hesitation` |
| `backtracking`     | 0.20   | `backtracking`    |
| `failed_attempts`  | 0.30   | `failed_attempt`  |
| `totalDifficulty`  | 0.10   | Any scored event  |

**Default threshold**: `0.70`. At least two distinct signal types are typically required to cross the threshold (e.g., repeated_clicks + hesitation = 0.35 + 0.25 + 0.10 = 0.70).

## Demo Guide

1. Start both backend and frontend servers
2. Open the browser UI at `http://localhost:5173`
3. Use the **simulation buttons** to inject telemetry signals:
   - **Repeated Clicks** — Simulates frustrated repeated clicking
   - **Hesitation** — Simulates long pauses indicating confusion
   - **Errors** — Simulates form validation failures
4. Watch the **Cognitive Load Gauge** rise toward the 0.70 threshold
5. When the threshold is crossed, the **Pipeline Stepper** advances through:
   Monitoring → Difficulty Detected → Generating → Validating → Adapted
6. The LLM generates a simplified UI, which is validated and rendered while preserving form state

## License

Private — © 2026 AuraGen Team
