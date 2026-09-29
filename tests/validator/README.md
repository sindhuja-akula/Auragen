# Validator Tests

Tests for AST parsing, security policy checks, and the aggregate
`validateGeneratedUI()` validation result.

- `valid.test.ts` — legitimate components (including hooks, arrow
  components) pass.
- `invalid.test.ts` — malformed syntax, unapproved imports, and
  non-component code are rejected with a specific reason.
- `malicious.test.ts` — `eval`, `new Function`, `fs`, `child_process`,
  dynamic `import()`, `fetch`, `new WebSocket`, `require` are all rejected.
- `prompt-injection.test.ts` — the validator is prompt-blind; injected
  unsafe code is rejected regardless of surrounding framing text.
- `state-safety.test.ts` — components receiving/mirroring external state via
  props are not falsely rejected; attempts to exfiltrate state via a
  forbidden network call are rejected.
- `failure.test.ts` — malformed, empty, and garbage input never throws;
  the pipeline always resolves to a `ValidationResult`.

Run with `npm test` (Vitest).
