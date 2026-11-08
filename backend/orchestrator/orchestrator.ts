import type { AdaptationResult } from '../../shared/contracts/adaptation.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { ValidationResult } from '../../shared/contracts/validation.js';
import { LLMGenerator } from '../generation/llmGenerator.js';
import { validateGeneratedUI } from '../../validator/validator/validateGeneratedUI.js';
import { StateMachine, type StateValue } from './stateMachine.js';

// ─── Debug mode ────────────────────────────────────────────────────────────
// Set ADAPTATION_DEBUG_MODE=true in .env to bypass Groq and use a known-safe
// fixture. This is ONLY for isolating the rendering/transport pipeline.
// NEVER use this in production.
const DEBUG_MODE = process.env.ADAPTATION_DEBUG_MODE === 'true';

function makeDebugFixture(targetElementId: string, state: Record<string, unknown>): GeneratedUI {
  if (targetElementId === 'accountType') {
    return {
      code: `
import React, { useState } from 'react';
function AdaptedAccountType({ initialValues, onStateChange }) {
  const [selected, setSelected] = useState(initialValues && initialValues.accountType ? initialValues.accountType : 'developer');
  function pick(val) {
    setSelected(val);
    if (onStateChange) onStateChange({ accountType: val });
  }
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600', color: '#9ca3af' }}>Account Type</label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={function(){ pick('student'); }} style={{ padding: '10px 18px', background: selected === 'student' ? '#6366f1' : '#1a2234', color: '#fff', border: '1px solid #6366f1', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Student</button>
        <button type="button" onClick={function(){ pick('developer'); }} style={{ padding: '10px 18px', background: selected === 'developer' ? '#6366f1' : '#1a2234', color: '#fff', border: '1px solid #6366f1', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Developer</button>
        <button type="button" onClick={function(){ pick('business'); }} style={{ padding: '10px 18px', background: selected === 'business' ? '#6366f1' : '#1a2234', color: '#fff', border: '1px solid #6366f1', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Business</button>
      </div>
      <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: '#06b6d4' }}>Simplified 1-click account type selection.</span>
    </div>
  );
}
`,
      componentName: 'AdaptedAccountType',
      dependencies: ['react'],
      metadata: { target: 'accountType', debug: true },
    };
  }

  if (targetElementId === 'phone') {
    return {
      code: `
import React, { useState } from 'react';
function AdaptedPhoneField({ initialValues, onStateChange }) {
  const [value, setValue] = useState(initialValues && initialValues.phone ? initialValues.phone : '');
  function handleChange(e) {
    setValue(e.target.value);
    if (onStateChange) onStateChange({ phone: e.target.value });
  }
  return (
    <div>
      <label htmlFor="phone" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#9ca3af' }}>Phone Number</label>
      <input
        id="phone"
        name="phone"
        type="tel"
        value={value}
        onChange={handleChange}
        placeholder="e.g. +1 (555) 000-0000"
        style={{ width: '100%', padding: '12px 14px', background: '#1a2234', border: '2px solid #6366f1', borderRadius: '10px', color: '#f3f4f6', fontSize: '15px' }}
      />
      <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: '#06b6d4' }}>Include standard 10-digit number.</span>
    </div>
  );
}
`,
      componentName: 'AdaptedPhoneField',
      dependencies: ['react'],
      metadata: { target: 'phone', debug: true },
    };
  }

  if (targetElementId === 'name') {
    return {
      code: `
import React, { useState } from 'react';
function AdaptedNameField({ initialValues, onStateChange }) {
  const [value, setValue] = useState(initialValues && initialValues.name ? initialValues.name : '');
  function handleChange(e) {
    setValue(e.target.value);
    if (onStateChange) onStateChange({ name: e.target.value });
  }
  return (
    <div>
      <label htmlFor="name" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#9ca3af' }}>Full Legal Name</label>
      <input
        id="name"
        name="name"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="First and Last Name"
        style={{ width: '100%', padding: '12px 14px', background: '#1a2234', border: '2px solid #6366f1', borderRadius: '10px', color: '#f3f4f6', fontSize: '15px' }}
      />
      <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: '#06b6d4' }}>Enter your full legal name as it appears on official documents.</span>
    </div>
  );
}
`,
      componentName: 'AdaptedNameField',
      dependencies: ['react'],
      metadata: { target: 'name', debug: true },
    };
  }

  // Default: email field adaptation
  return {
    code: `
import React, { useState } from 'react';
function AdaptedEmailField({ initialValues, onStateChange }) {
  const [value, setValue] = useState(initialValues && initialValues.email ? initialValues.email : '');
  function handleChange(e) {
    setValue(e.target.value);
    if (onStateChange) onStateChange({ email: e.target.value });
  }
  return (
    <div>
      <label htmlFor="email" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#9ca3af' }}>Email address</label>
      <input
        id="email"
        name="email"
        type="email"
        value={value}
        onChange={handleChange}
        placeholder="e.g. name@example.com"
        style={{ width: '100%', padding: '12px 14px', background: '#1a2234', border: '2px solid #6366f1', borderRadius: '10px', color: '#f3f4f6', fontSize: '15px' }}
      />
      <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: '#06b6d4' }}>Example: name@example.com</span>
    </div>
  );
}
`,
    componentName: 'AdaptedEmailField',
    dependencies: ['react'],
    metadata: { target: targetElementId, debug: true },
  };
}

// ─── Ports ─────────────────────────────────────────────────────────────────
export type GenerationPort = {
  generate(request: RedesignRequest, adaptationId?: string): GeneratedUI | Promise<GeneratedUI>;
};

export type ValidationPort = {
  validate(generated: GeneratedUI, request: RedesignRequest): ValidationResult | Promise<ValidationResult>;
};

type ApplyResult = { restoredState?: Record<string, unknown> };
type ApplyPort = {
  apply(
    generated: GeneratedUI,
    context: OrchestratorContext,
  ): ApplyResult | void | Promise<ApplyResult | void>;
};

export type OrchestratorOptions = {
  generationTimeoutMs?: number;
  now?: () => number;
  logger?: Pick<Console, 'log' | 'error'>;
  validator?: ValidationPort;
  applier?: ApplyPort;
};

export type OrchestratorContext = {
  currentUI?: Record<string, unknown>;
  sessionId?: string;
  currentState?: Record<string, unknown>;
  allowedComponents?: string[];
  targetElementId?: string;
};

// Simple trace-ID counter — increments per process lifetime
let traceCounter = 0;
function nextAdaptationId(): string {
  return `adapt-${String(++traceCounter).padStart(3, '0')}`;
}

export class Orchestrator {
  private readonly stateMachine = new StateMachine();
  private generationInFlight = false;
  private cooldownUntil = 0;
  private latestEvidence?: CognitiveScore;
  private activeGenerationId?: number;
  private nextGenerationId = 1;

  constructor(
  private readonly cooldownMs = 5000,
  private readonly generator?: GenerationPort,
  private readonly options: OrchestratorOptions = {},
) {}

  get currentState(): StateValue {
    return this.stateMachine.state;
  }

  setGenerationInFlight(value: boolean): void {
    this.generationInFlight = value;
  }

  get latestScore(): CognitiveScore | undefined {
    return this.latestEvidence;
  }

  async evaluate(
    score: CognitiveScore,
    context: OrchestratorContext = {},
  ): Promise<AdaptationResult> {
    const validation = this.validateInput(score, context);
    if (validation) return validation;

    this.latestEvidence = score;
    if (this.generationInFlight) {
      this.log('evidence_recorded', { score: score.score });
      return {
        status: 'no_adaptation',
        reason: 'generation already in progress',
        restoredState: context.currentState ?? {},
      };
    }

    const now = this.now();
    if (this.stateMachine.state === 'COOLDOWN' && now >= this.cooldownUntil) {
      this.stateMachine.transition('IDLE');
      this.log('cooldown_expired');
    }

    if (now < this.cooldownUntil) {
      this.stateMachine.transition('COOLDOWN');
      return {
        status: 'no_adaptation',
        reason: 'cooldown active',
        restoredState: context.currentState ?? {},
      };
    }

    this.stateMachine.transition('DETECTING');

    if (score.score < score.threshold) {
      this.stateMachine.transition('IDLE');
      return {
        status: 'no_adaptation',
        reason: 'score below threshold',
        restoredState: context.currentState ?? {},
      };
    }

    // Threshold crossed — begin adaptation trace
    const adaptationId = nextAdaptationId();
    const target = context.targetElementId ?? 'unknown';

    console.log(`\n${'='.repeat(50)}`);
    console.log(`AURAGEN ADAPTATION TRACE: ${adaptationId}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`[ADAPTATION][${adaptationId}] [2] COGNITIVE_SCORE score=${score.score.toFixed(3)} threshold=${score.threshold} signals=${JSON.stringify(score.signals)} target="${target}" TRIGGERED=YES`);

    this.stateMachine.transition('ADAPTATION_REQUESTED');
    this.generationInFlight = true;
    const generationId = this.nextGenerationId++;
    this.activeGenerationId = generationId;
    console.log(`[ADAPTATION][${adaptationId}] [3] ORCHESTRATOR status=GENERATING target="${target}" generationId=${generationId}`);

    const adaptationStartTime = this.now();

    const request: RedesignRequest = {
      sessionId: context.sessionId ?? 'session-1',
      currentUI: context.currentUI ?? { title: 'safe-ui' },
      cognitiveSignals: score.signals,
      currentState: context.currentState ?? { mode: 'default' },
      allowedComponents: context.allowedComponents ?? [
        'form',
        'div',
        'section',
        'label',
        'input',
        'button',
        'select',
        'option',
        'textarea',
        'p',
        'span',
      ],
      ...(context.targetElementId !== undefined ? { targetElementId: context.targetElementId } : {}),
    };

    this.stateMachine.transition('GENERATING');

    try {
      let result: GeneratedUI;

      if (DEBUG_MODE) {
        // ── DEBUG MODE: bypass Groq, use a known-safe fixture ──────────────
        console.log(`[ADAPTATION][${adaptationId}] [4] GROQ BYPASSED (ADAPTATION_DEBUG_MODE=true) — using debug fixture for target="${target}"`);
        result = makeDebugFixture(target, context.currentState ?? {});
        console.log(`[ADAPTATION][${adaptationId}] [5] GENERATED_UI componentName="${result.componentName}" codeLength=${result.code.length} (DEBUG FIXTURE)`);
      } else {
        // ── NORMAL MODE: call Groq ─────────────────────────────────────────
        const generatorCall = this.generator
          ? this.generator.generate(request)
          : new LLMGenerator().generate(request, adaptationId);
        const rawResult = await this.withTimeout(
          generatorCall,
          generationId,
        );

        if (this.activeGenerationId !== generationId) {
          console.warn(`[ADAPTATION][${adaptationId}] STALE_RESULT_REJECTED generationId=${generationId}`);
          return this.failure('stale generation result', context, 'adaptation_failed', adaptationId);
        }

        if (!isGeneratedUI(rawResult)) {
          throw new Error('Generation returned malformed output');
        }

        result = rawResult;
        console.log(`[ADAPTATION][${adaptationId}] [5] GENERATED_UI componentName="${result.componentName}" codeLength=${result.code.length} deps=${JSON.stringify(result.dependencies)}`);
      }

      // ── AST / Security Validation ────────────────────────────────────────
      this.stateMachine.transition('VALIDATING');
      console.log(`[ADAPTATION][${adaptationId}] [7] AST_VALIDATION_START`);
      const validationResult = await (this.options.validator ?? this.defaultValidator).validate(
        result,
        request,
      );

      if (!validationResult.valid) {
        const reason = `validation failed: ${validationResult.errors.join(', ') || 'invalid generated UI'}`;
        console.error(`[ADAPTATION][${adaptationId}] AST_VALIDATION_FAIL reason="${reason}"`);
        return this.failure(reason, context, 'validation_failed', adaptationId);
      }

      console.log(`[ADAPTATION][${adaptationId}] [7] AST_VALIDATION_PASS`);

      // ── Apply ────────────────────────────────────────────────────────────
      this.stateMachine.transition('APPLYING');
      console.log(`[ADAPTATION][${adaptationId}] [8] BACKEND_APPLY_START`);
      const applied = await (this.options.applier ?? this.defaultApplier).apply(result, context);
      this.cooldownUntil = this.now() + this.cooldownMs;
      this.stateMachine.transition('COOLDOWN');

      const totalLatency = Math.max(0, this.now() - adaptationStartTime);
      console.log(`[ADAPTATION][${adaptationId}] [8] BACKEND_APPLY_SUCCESS latencyMs=${totalLatency}`);
      console.log(`[ADAPTATION][${adaptationId}] SENDING adaptation_complete to frontend...`);

      return {
        status: 'adaptation_complete',
        component: result.componentName,
        generatedUI: result,
        targetElementId: target,
        restoredState: applied?.restoredState ?? context.currentState ?? {},
        latency: totalLatency,
        reason: 'adaptation applied after validation',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'adaptation failed';
      console.error(`[ADAPTATION][${adaptationId}] PIPELINE_ERROR reason="${reason}"`);
      return this.failure(reason, context, 'adaptation_failed', adaptationId);
    } finally {
      this.generationInFlight = false;
      this.activeGenerationId = undefined;
    }
  }

  private readonly defaultValidator: ValidationPort = {
    validate: (generated, _request) => {
      const result = validateGeneratedUI(generated.code);
      return result;
    },
  };

  private readonly defaultApplier: ApplyPort = {
    apply: (_generated, context) => ({ restoredState: context.currentState ?? {} }),
  };

  private validateInput(score: CognitiveScore, context: OrchestratorContext): AdaptationResult | undefined {
    if (!Number.isFinite(score.score) || score.score < 0 || score.score > 1) {
      return this.failure('invalid cognitive score', context, 'adaptation_failed');
    }
    if (!Number.isFinite(score.threshold) || score.threshold < 0 || score.threshold > 1) {
      return this.failure('invalid cognitive threshold', context, 'adaptation_failed');
    }
    if (!Number.isFinite(score.timestamp)) {
      return this.failure('invalid cognitive timestamp', context, 'adaptation_failed');
    }
    if (context.sessionId !== undefined && context.sessionId.length === 0) {
      return this.failure('invalid session id', context, 'adaptation_failed');
    }
    return undefined;
  }

  private failure(
    reason: string,
    context: OrchestratorContext,
    status: AdaptationResult['status'] = 'adaptation_failed',
    adaptationId?: string,
  ): AdaptationResult {
    if (this.stateMachine.state !== 'FAILED') {
      try { this.stateMachine.transition('FAILED'); } catch { /* ignore invalid transitions from IDLE */ }
    }
    if (adaptationId) {
      console.error(`[ADAPTATION][${adaptationId}] FINAL_RESULT: ADAPTATION_FAILED reason="${reason}"`);
      console.log(`${'='.repeat(50)}\n`);
    }
    this.log('adaptation_failed', { reason });
    return { status, reason, targetElementId: context.targetElementId, restoredState: context.currentState ?? {} };
  }

  private withTimeout<T>(operation: T | Promise<T>, generationId: number): Promise<T> {
    const timeoutMs = this.options.generationTimeoutMs;
    if (timeoutMs === undefined) return Promise.resolve(operation);

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeGenerationId = undefined;
        this.log('generation_timeout', { generationId });
        reject(new Error('generation timeout'));
      }, timeoutMs);
      Promise.resolve(operation).then(
        (value) => {
          clearTimeout(timeout);
          if (this.activeGenerationId !== generationId) {
            this.log('stale_result_rejected', { generationId });
          }
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private log(event: string, details: Record<string, unknown> = {}): void {
    (this.options.logger ?? console).log('[orchestrator]', {
      event,
      state: this.currentState,
      ...details,
    });
  }

  run() {
    return 'orchestration started';
  }
}

function isGeneratedUI(value: unknown): value is GeneratedUI {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const generated = value as Record<string, unknown>;
  return typeof generated.code === 'string' &&
    typeof generated.componentName === 'string' &&
    Array.isArray(generated.dependencies) &&
    generated.dependencies.every((dependency) => typeof dependency === 'string') &&
    typeof generated.metadata === 'object' &&
    generated.metadata !== null &&
    !Array.isArray(generated.metadata);
}
