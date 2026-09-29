# Shared Contracts

AuraGen uses the shared contract layer as the single source of truth for information crossing M2, M1, M3, and M4 boundaries. These contracts are intentionally small: lifecycle metadata, provider details, AST internals, security analysis, and raw telemetry history do not belong in them.

## Contract table

| Contract | Producer | Consumer |
| --- | --- | --- |
| `TelemetryEvent` | M2 telemetry | M1 scoring pipeline |
| `CognitiveScore` | Cognitive scorer | M1 orchestrator |
| `RedesignRequest` | M1 orchestrator | M3 generator |
| `GeneratedUI` | M3 generator | M4 validator and M1/M2 application boundary |
| `ValidationResult` | M4 validator | M1 orchestrator |
| `AdaptationResult` | M1 orchestrator | M2/integration |

## Frozen contracts

### `TelemetryEvent`

Required fields are `sessionId`, `timestamp`, `eventType`, `elementId`, and `metadata`. `eventType` describes the observed event; it is not renamed to `type`. `metadata` contains event-specific observations and is not a replacement for the required fields.

### `CognitiveScore`

`score` is the measured difficulty, `threshold` is the policy boundary supplied to M1, `signals` contains the current signal vocabulary as `string[]`, and `timestamp` identifies when the score was produced. The scorer measures; M1 decides.

### `RedesignRequest`

M1 sends M3 a focused request containing `sessionId`, `currentUI`, `cognitiveSignals`, `currentState`, and `allowedComponents`. It does not contain raw telemetry history, transport objects, provider credentials, AST/security results, or `shouldAdapt`.

### `GeneratedUI`

M3 returns generated source as data in `code`, with the associated `componentName`, dependency names, and metadata. The source is never executed by M3. `componentName` is the identifier used in an `AdaptationResult`; it is not generated source or JSX.

### `ValidationResult`

`valid` is the canonical validation decision. `true` permits the next lifecycle step; `false` rejects the candidate. `errors`, `warnings`, and optional `issues` carry diagnostics. There is no competing `ok` field.

### `AdaptationResult`

`status` is an external outcome, separate from M1's internal state machine. The controlled statuses are `no_adaptation`, `adaptation_started`, `adaptation_failed`, `validation_failed`, and `adaptation_complete`. `component` is a component identifier, `restoredState` reports preserved state, `latency` is adaptation timing, and `reason` explains the decision or failure.

## Freeze rule

These contracts are frozen for the current MVP. Do not change field names, meanings, types, required/optional status, or status semantics silently.

A future change requires:

1. Identify the concrete architectural problem.
2. Explain why the current contract is insufficient.
3. Identify every producer and consumer and the breaking impact.
4. Obtain Team Lead review.
5. Update all affected code, tests, and documentation in one explicit contract-change commit.

M1 generation IDs remain internal lifecycle metadata and are not added to public contracts without that process.
