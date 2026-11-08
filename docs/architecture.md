# Architecture

AuraGen uses a layered adaptive UI pipeline: frontend telemetry is scored by the cognitive scorer, the M1 orchestrator decides whether the current evidence justifies adaptation, M3 generates a candidate, M4 validates it, and M2 applies it while preserving state.

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React 19)                   │
│                                                         │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │  AdaptiveForm│  │DomTelemetry │  │  WS Client    │  │
│  │  (main UI)   │──│  Tracker    │──│  (transport)  │──┼──┐
│  └──────┬───────┘  └─────────────┘  └───────────────┘  │  │
│         │                                               │  │
│  ┌──────▼───────┐  ┌─────────────┐  ┌───────────────┐  │  │
│  │DynamicRender │  │ ErrorBound  │  │ componentLoad │  │  │
│  │  (safe mount)│──│  (fallback) │  │  (sandboxed)  │  │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │  │
└─────────────────────────────────────────────────────────┘  │
                                                             │
                         WebSocket                           │
                                                             │
┌─────────────────────────────────────────────────────────┐  │
│                   Node.js Backend                       │  │
│                                                         │  │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │  │
│  │  WS Server   │──│ Telemetry   │──│  Cognitive    │  │  │
│  │  (transport) │◄─│  Pipeline   │  │  Scorer       │──┼──┘
│  └──────┬───────┘  └─────────────┘  └───────────────┘  │
│         │                                               │
│  ┌──────▼───────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Orchestrator │──│ LLMGenerator│──│ Groq SDK      │  │
│  │ (M1 state)   │  │ (M3)        │  │ (gpt-oss-20b) │  │
│  └──────┬───────┘  └─────────────┘  └───────────────┘  │
│         │                                               │
│  ┌──────▼───────┐  ┌─────────────┐  ┌───────────────┐  │
│  │  validateGen │──│ Babel AST   │──│ Security      │  │
│  │  eratedUI(M4)│  │ Parser      │  │ Policy        │  │
│  └──────────────┘  └──────┬──────┘  └───────────────┘  │
│                           │                             │
│                    ┌──────▼──────┐                      │
│                    │ JSX Compiler│                      │
│                    │ (transform) │                      │
│                    └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## M1 Orchestration Lifecycle

The state machine represents completed lifecycle events:

`IDLE -> DETECTING -> ADAPTATION_REQUESTED -> GENERATING -> VALIDATING -> APPLYING -> COOLDOWN -> IDLE`

Validation, application, and state restoration are injected ports. M1 coordinates their result but does not parse generated code, render React, collect telemetry, or implement state restoration. A candidate is never applied unless validation succeeds. `adaptation_complete` is returned only after application succeeds.

Below-threshold evidence returns `no_adaptation` and leaves the safe UI unchanged. Failures enter `FAILED`, preserve the caller's current state in the result, release the generation lock, and allow a later valid evaluation to recover.

## Concurrency and Evidence

There is one in-process active generation. Repeated or concurrent evidence is recorded as the latest cognitive score and does not start another generation. The active lifecycle has a local generation ID; a result from a timed-out or otherwise inactive lifecycle is rejected as stale.

## Cooldown and Timeout

Cooldown starts only after validation and application succeed. High scores received during cooldown are ignored for generation and retained as latest evidence. An injected clock makes cooldown expiry deterministic in tests. An optional generation timeout moves a hung generation to `FAILED` and releases the lock.

The WebSocket layer validates transport messages, while M1 validates domain assumptions such as finite scores, score range, threshold range, timestamp, and session identity.

## Dynamic Rendering Security Boundary

The rendering pipeline follows a strict trust chain:

1. **LLM generates code** — Untrusted. Output is treated as adversarial input.
2. **AST Security Validation** (`validateGeneratedUI`) — Static analysis via Babel parser enforces:
   - Only standard HTML/React elements allowed (no custom imports beyond `react`)
   - Banned globals: `eval`, `Function`, `require`, `fetch`, `WebSocket`, `document.cookie`, etc.
   - Banned elements: `<script>`, `<iframe>`, `<object>`, `<embed>`
   - Banned attributes: `dangerouslySetInnerHTML`, external URLs in `src`/`action`/`href`
   - No dynamic `import()` expressions
3. **JSX Compilation** (`compileJsxToExecutable`) — Transforms JSX to `React.createElement` calls, strips ES module imports/exports
4. **Controlled Closure** (`loadComponent`) — Executes compiled code in a closure that shadows sensitive browser globals (`window`, `document`, `globalThis`, `fetch`, `WebSocket`, `localStorage`, `sessionStorage`, `indexedDB`, `location`, `navigator`, `alert`) as `undefined`
5. **Error Boundary** — Runtime errors in the rendered component are caught, and the system falls back to the existing safe UI

**No raw `eval()` or `new Function()` is used to bypass validation.** The only function constructor call happens in `componentLoader.ts` after all static validation has passed, and it receives a carefully constructed parameter list that shadows dangerous globals.

## State Preservation

When adaptation occurs, form state is captured from the current UI via `StateManager`, included in the `RedesignRequest.currentState`, and passed through the pipeline. The generated UI receives `initialValues` as props, and the `DynamicRenderer` restores state into the new component via React props.

## WebSocket Message Protocol

| Direction | Message Type       | Purpose                              |
| --------- | ------------------ | ------------------------------------ |
| Client→Server | `telemetry`    | Send interaction telemetry event     |
| Server→Client | `cognitive_score` | Current cognitive load score       |
| Server→Client | `redesign_started` | Adaptation pipeline has begun     |
| Server→Client | `redesign_result`  | Validated UI + restored state      |
| Server→Client | `redesign_failed`  | Failure with reason + preserved state |
