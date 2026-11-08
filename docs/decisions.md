# Decisions

Document key engineering decisions, trade-offs, and architecture rationale here.
#	Decision	Choice	Reason / Trade-off
D1	Overall architecture	Layered modular architecture	Keeps responsibilities separated and makes the system easier to integrate, test, and debug.
D2	Adaptation decision maker	Orchestrator	The Cognitive Scorer measures difficulty. It should not independently decide when to generate a new UI.
D3	Difficulty measurement	Heuristic Cognitive Load Scorer	We need a practical MVP rather than complicated ML-based cognitive-load prediction.
D4	Real-time communication	WebSocket	Used for real-time telemetry/adaptation communication. WebSocket is transport, not the decision-maker.
D5	LLM output	Structured UI generation	The LLM should generate within defined constraints rather than arbitrary code.
D6	LLM trust	Never trust generated code directly	LLM output is untrusted and must pass validation before rendering.
D7	Code inspection	Babel parser + AST	AST gives us a structured representation that allows the system to inspect generated code.
D8	Security enforcement	Explicit security policy separate from AST parsing	Parsing answers "is this syntactically valid?" Policy answers "is this capability allowed?"
D9	Unsafe generated UI	Reject entire candidate	Do not attempt to remove one suspicious line and continue. Rewriting unsafe generated code increases complexity and risk.
D10	Unsafe/failed adaptation	Fallback to current/known-safe UI	The existing interface should remain usable rather than allowing a failed generation to break the application.
D11	Adaptation concurrency	One adaptation generation at a time	Prevents multiple LLM generations from competing and creating inconsistent UI states.
D12	In-flight protection	Use an in-flight lock/state	If another high-difficulty signal arrives while generation is happening, don't start another generation.
D13	New evidence during generation	Record it, don't trigger another generation	The new signal can be considered during later evaluation.
D14	Post-adaptation protection	Cooldown	Prevents immediate repeated redesigns after an adaptation.
D15	Cooldown meaning	Cooldown delays another decision, not automatically another generation	After cooldown, the system should reevaluate fresh evidence.
D16	State preservation	Explicit state preservation	UI replacement must not destroy user-entered data or interaction state.
D17	Cognitive score responsibility	Score + signals/reasons only	shouldAdapt belongs to orchestration policy, not the scorer.
D18	LLM context	Don't send raw telemetry history to LLM	The orchestrator should convert relevant evidence into a focused RedesignRequest.
D19	Adaptation objective	Reduce demonstrated user difficulty	The LLM should solve a specific usability problem, not simply generate a prettier UI.
D20	Shared interfaces	Explicit contracts between layers	Producers and consumers need agreed input/output structures to avoid integration chaos.
D21	Contract implementation	Shared contract definitions	Use shared definitions such as TelemetryEvent, CognitiveScore, RedesignRequest, etc.
D22	Contract changes	No casual breaking changes	Changes should be communicated and deliberately handled. For this 2-week project, don't over-engineer versioning.
D23	Repository architecture	Single repository	Keeps integration simple for the short project.
D24	Microservices	No microservices	They add deployment/network/coordination complexity without solving a current problem.
D25	Renderer responsibility	Render validated UI only	Renderer should not become another security/validation layer.
D26	Telemetry responsibility	Capture meaningful signals only	We don't need to send every possible user action.
D27	Team integration	Progressive integration, not isolated mini-projects	Every layer must eventually work with the others.
D28	Team Lead responsibility	Architecture + contracts + orchestration + integration + failure handling	Your role is to make the system work as one system, not to code every layer.
D29	Telemetry pipeline	WebSocket validates and forwards; a separate pipeline scores bounded per-session history and calls the Orchestrator	Transport remains decision-free while telemetry reaches cognitive policy.
D30	Generator boundary	Pass the shared RedesignRequest directly to the generation port	Generation implementations must adapt to the shared contract, not the reverse.
D31	Unvalidated output	Do not send generated content to the frontend until AST/security validation is implemented and connected	The current validator is a stub and must not authorize rendering.
D32	Async generation lock	Keep the in-flight lock until the generation promise settles; retain current state while concurrent evidence is observed	Prevents overlapping generation while allowing later score reevaluation.
D33	Lifecycle truth	Enter VALIDATING only after M3 returns, APPLYING only after M4 approves, and COOLDOWN only after M2 applies successfully	State names must describe real events; generated output alone is not an adaptation.
D34	Latest evidence	Retain the newest CognitiveScore while a generation is active	Prevents adaptation storms without losing the most relevant signal.
D35	Generation timeout	Use an optional in-process timeout around M3 and release the active generation identity on expiry	A hung provider must not permanently block future adaptations.
D36	Stale result handling	Associate each lifecycle with a local generation ID and reject results after timeout or lifecycle invalidation	Late provider results must never overwrite a newer lifecycle.
D37	Boundary ports	Inject validation and application ports into M1 while keeping validator and renderer responsibilities outside the orchestrator	This makes failure paths testable without moving M4 or M2 logic into M1.
D38	Shared contract authority	Freeze the six contracts under shared/contracts as the single source of truth	Prevents field and semantic drift between M1, M2, M3, and M4; future changes require coordinated Team Lead review.
D39	Validation decision field	Use valid as the canonical ValidationResult success field and remove ok	Two competing booleans could contradict each other; M1 and M4 now share one decision.
D40	Generated UI boundary	M3 returns GeneratedUI and M4 consumes it; M1 reports componentName rather than source code	Keeps generated source in GeneratedUI.code and preserves AdaptationResult.component as an identifier.

## Post-Takeover Decisions (Engineering Audit)

D41	Dynamic rendering security	Controlled closure with shadowed globals, NOT raw eval/new Function	After AST validation and JSX-to-createElement compilation, code runs in a function scope where `window`, `document`, `globalThis`, `fetch`, etc. are shadowed as `undefined`. This provides defense-in-depth beyond static AST validation.
D42	JSX compilation approach	Babel AST traversal to React.createElement	Custom AST traversal replaces JSX syntax with React.createElement calls. This avoids depending on a full bundler or runtime transpiler and keeps the compilation step auditable and deterministic.
D43	LLM prompt hardening	Explicit component capability list in system prompt	The system prompt includes an explicit allowedComponents list and explicitly bans non-existent packages. This reduces hallucinated imports and guides the model to produce valid, restrictable output.
D44	JSON extraction from LLM	Strip code fences globally + extract outermost braces	The model sometimes wraps JSON in markdown code fences or surrounds it with conversational text. The `extractJson` helper handles both cases with a bounded retry for unicode escape sanitization.
D45	max_tokens increase	2048 → 4096	Prevents truncated JSON responses from the LLM, which was a primary cause of parse failures. The model (gpt-oss-20b) generates medium-sized React components that sometimes exceed 2048 tokens.
D46	Error boundary pattern	React error boundary component wrapping DynamicRenderer	Runtime errors in LLM-generated components (e.g., TypeError on undefined prop) are caught and the system reverts to the last safe UI. The user never sees a blank screen.
D47	WebSocket bidirectional transport	Server sends cognitive_score, redesign_started, redesign_result, redesign_failed	The frontend receives real-time pipeline status updates for the cognitive score gauge and pipeline stepper visualization, not just the final result.
D48	Package.json dev script	Alias dev → dev:frontend, add dev:backend	The original `dev` script referenced a non-existent `src/index.ts`. Now `npm run dev` starts the Vite frontend, and `npm run dev:backend` starts the WebSocket server.