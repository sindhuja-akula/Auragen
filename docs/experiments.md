# Experiments

Track experimental prompt variations, validation strategies, and telemetry experiments here.

## 2026-09-29: Browser telemetry through cognitive scoring

**Question:** Does merged frontend telemetry reach Node and drive a cognitive/orchestration decision?

**Hypothesis:** Repeated-click, backtracking, and failed-attempt events in one browser session accumulate to the 0.7 threshold; later high evidence during cooldown does not start another generation.

**Experiment:** Started Vite and `npm run start:ws`, clicked Submit three times, switched focus repeatedly, and blurred an invalid phone value twice. Observed the same session ID on each valid telemetry event, followed by score and decision logs.

**Result:** Scores progressed from 0.4 to 0.65 to 0.7. The threshold-crossing event returned `adaptation_started` in `COOLDOWN`; a following 0.9 score was suppressed as `cooldown active`. The full suite passed 30 tests and the TypeScript build passed.

**Explanation:** The scorer maps frontend event names to cognitive signals over a bounded 20-event session window. The Orchestrator owns threshold, in-flight, and cooldown decisions.

**Lesson:** Browser → WebSocket → Node → CognitiveScore → Orchestrator is verified. Generated UI integration is not: Member 3's branch uses a private request shape, and the current AST/security validator is a stub. Keep generated output out of the renderer until those boundaries are implemented and tested.
