# Architecture

AuraGen uses a layered adaptive UI pipeline: frontend telemetry is scored by the cognitive scorer, the M1 orchestrator decides whether the current evidence justifies adaptation, M3 generates a candidate, M4 validates it, and M2 applies it while preserving state.

## M1 orchestration lifecycle

The state machine represents completed lifecycle events:

`IDLE -> DETECTING -> ADAPTATION_REQUESTED -> GENERATING -> VALIDATING -> APPLYING -> COOLDOWN -> IDLE`

Validation, application, and state restoration are injected ports. M1 coordinates their result but does not parse generated code, render React, collect telemetry, or implement state restoration. A candidate is never applied unless validation succeeds. `adaptation_complete` is returned only after application succeeds.

Below-threshold evidence returns `no_adaptation` and leaves the safe UI unchanged. Failures enter `FAILED`, preserve the caller's current state in the result, release the generation lock, and allow a later valid evaluation to recover.

## Concurrency and evidence

There is one in-process active generation. Repeated or concurrent evidence is recorded as the latest cognitive score and does not start another generation. The active lifecycle has a local generation ID; a result from a timed-out or otherwise inactive lifecycle is rejected as stale.

## Cooldown and timeout

Cooldown starts only after validation and application succeed. High scores received during cooldown are ignored for generation and retained as latest evidence. An injected clock makes cooldown expiry deterministic in tests. An optional generation timeout moves a hung generation to `FAILED` and releases the lock.

The WebSocket layer validates transport messages, while M1 validates domain assumptions such as finite scores, score range, threshold range, timestamp, and session identity.
