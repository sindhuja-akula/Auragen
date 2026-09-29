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
