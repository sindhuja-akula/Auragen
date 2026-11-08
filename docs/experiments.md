# Experiments

Track experimental prompt variations, validation strategies, and telemetry experiments here.

## 2026-09-29: Browser telemetry through cognitive scoring

**Question:** Does merged frontend telemetry reach Node and drive a cognitive/orchestration decision?

**Hypothesis:** Repeated-click, backtracking, and failed-attempt events in one browser session accumulate to the 0.7 threshold; later high evidence during cooldown does not start another generation.

**Experiment:** Started Vite and `npm run start:ws`, clicked Submit three times, switched focus repeatedly, and blurred an invalid phone value twice. Observed the same session ID on each valid telemetry event, followed by score and decision logs.

**Result:** Scores progressed from 0.4 to 0.65 to 0.7. The threshold-crossing event returned `adaptation_started` in `COOLDOWN`; a following 0.9 score was suppressed as `cooldown active`. The full suite passed 30 tests and the TypeScript build passed.

**Explanation:** The scorer maps frontend event names to cognitive signals over a bounded 20-event session window. The Orchestrator owns threshold, in-flight, and cooldown decisions.

**Lesson:** Browser → WebSocket → Node → CognitiveScore → Orchestrator is verified. Generated UI integration is not: Member 3's branch uses a private request shape, and the current AST/security validator is a stub. Keep generated output out of the renderer until those boundaries are implemented and tested.

## 2026-09-29: M1 deliberate-break experiments

| Experiment | Expected result | Actual result | Lesson |
| --- | --- | --- | --- |
| M3 never resolves | Timeout, `FAILED`, future request works | Passing test: timeout releases the lock and recovery succeeds | Provider hangs are recoverable when timeout cleanup clears lifecycle identity |
| Ten high-score events during one generation | At most one active generation | Passing test: generator called once and latest score retained | Latest evidence is sufficient; an unbounded queue is unnecessary |
| Old result resolves after timeout and retry | Old result rejected, new UI is the only applied result | Passing test: applier called once for the new result | Local generation identity prevents stale application |
| M4 rejects candidate | Current UI preserved, no application, future retry works | Passing test: `validation_failed`, applier untouched, retry succeeds | Validation rejection is not successful cooldown |
| M2 application throws | `FAILED`, preserved state, future lifecycle remains possible | Passing test: `adaptation_failed` with preserved state | Application success is required for completion |
| Continuous high scores during cooldown | No adaptation storm | Passing test: cooldown blocks until injected clock expires | Cooldown is a decision gate, not another generation mechanism |

## 2026-10-07: AST Validator Performance Experiment

**Question:** What is the AST/security validation latency for components of varying size?

**Setup:** `experiments/ast-validation/performance-experiment.ts` — 5 warmup runs + 20 measurement runs per case. Measures `validateGeneratedUI()` only (no LLM, network, or rendering).

**Results:**

| Case               | Size     | Average    | Min        | Max        | Result |
| ------------------- | -------- | ---------- | ---------- | ---------- | ------ |
| Small component     | 61 B     | 0.546 ms   | 0.248 ms   | 2.036 ms   | ACCEPT |
| Medium component    | 669 B    | 1.293 ms   | 0.614 ms   | 4.863 ms   | ACCEPT |
| Large component     | 2426 B   | 2.187 ms   | 1.065 ms   | 4.132 ms   | ACCEPT |

**Lesson:** AST validation is sub-5ms even for large components. It is not the bottleneck; LLM generation dominates total pipeline latency.

## 2026-10-07: AST Security Experiment

**Question:** Does the security policy correctly ACCEPT safe payloads and REJECT every unsafe/edge pattern?

**Setup:** `experiments/ast-validation/security-experiment.ts` — 37 payloads covering SAFE (5), UNSAFE (27), and EDGE (5) categories.

**Results:** 37/37 payloads matched expected behavior. All safe code is accepted, all unsafe patterns (eval, Function, fetch, WebSocket, document.cookie, script/iframe elements, external URLs, dangerouslySetInnerHTML, etc.) are rejected.

**Lesson:** The AST security boundary is comprehensive for known attack patterns. It is static policy enforcement, not a complete JavaScript sandbox.

## 2026-10-07: End-to-End Pipeline Latency Experiment

**Question:** What is the total pipeline latency from telemetry scoring through LLM generation, AST validation, and JSX compilation?

**Setup:** `experiments/llm-generation/e2e-latency-experiment.ts` — Full pipeline with live Groq API call (gpt-oss-20b model).

**Results:**

| Stage                        | Latency     |
| ----------------------------- | ----------- |
| Telemetry + Cognitive Score   | ~0.25 ms    |
| LLM Generation (Groq)        | ~4000 ms    |
| AST / Security Validation     | ~130 ms     |
| JSX Transformation            | ~93 ms      |
| **TOTAL PIPELINE TIME**       | **~4250 ms** |

**Observations:**
- LLM generation accounts for >94% of total pipeline time
- AST validation + JSX compilation together take ~223ms (~5% of total)
- Telemetry scoring is sub-millisecond and negligible
- The LLM occasionally returns truncated JSON (increasing max_tokens from 2048 → 4096 mitigated this)
- The `extractJson` helper successfully handles markdown code fences and conversational wrapping

**Lesson:** Pipeline is dominated by LLM latency. Local processing (scoring, validation, compilation) adds minimal overhead. Total pipeline time of ~4-5 seconds is acceptable for an adaptive UI redesign that happens infrequently (only when cognitive load crosses threshold).
