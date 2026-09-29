import type { AdaptationResult } from '../../shared/contracts/adaptation.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { ValidationResult } from '../../shared/contracts/validation.js';
import { LLMGenerator } from '../generation/llmGenerator.js';
import { validateGeneratedUI } from '../../validator/validator/validateGeneratedUI.js';
import { StateMachine, type StateValue } from './stateMachine.js';

type GenerationOutput = { generated?: unknown };
type GenerationPort = {
  generate(request: RedesignRequest): GenerationOutput | Promise<GenerationOutput>;
};

type ValidationPort = {
  validate(generated: string, request: RedesignRequest): ValidationResult | Promise<ValidationResult>;
};

type ApplyResult = { restoredState?: Record<string, unknown> };
type ApplyPort = {
  apply(
    generated: string,
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
};

export class Orchestrator {
  private readonly stateMachine = new StateMachine();
  private generationInFlight = false;
  private cooldownUntil = 0;
  private latestEvidence?: CognitiveScore;
  private activeGenerationId?: number;
  private nextGenerationId = 1;

  constructor(
    private readonly cooldownMs = 5000,
    private readonly generator: GenerationPort = new LLMGenerator(),
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

    this.stateMachine.transition('ADAPTATION_REQUESTED');
    this.generationInFlight = true;
  const generationId = this.nextGenerationId++;
  this.activeGenerationId = generationId;
  this.log('generation_started', { generationId, score: score.score, reason: 'threshold_exceeded' });

    const request: RedesignRequest = {
      sessionId: context.sessionId ?? 'session-1',
      currentUI: context.currentUI ?? { title: 'safe-ui' },
      cognitiveSignals: score.signals,
      currentState: context.currentState ?? { mode: 'default' },
      allowedComponents: context.allowedComponents ?? ['button', 'card', 'form'],
    };

    this.stateMachine.transition('GENERATING');

    try {
      const result = await this.withTimeout(this.generator.generate(request), generationId);

      if (this.activeGenerationId !== generationId) {
        this.log('stale_result_rejected', { generationId });
        return this.failure('stale generation result', context);
      }

      if (!result || !result.generated || typeof result.generated !== 'string') {
        throw new Error('Generation returned malformed output');
      }

      this.stateMachine.transition('VALIDATING');
      const validationResult = await (this.options.validator ?? this.defaultValidator).validate(
        result.generated,
        request,
      );
      if (!validationResult.valid) {
        return this.failure(
          `validation failed: ${validationResult.errors.join(', ') || 'invalid generated UI'}`,
          context,
          'validation_failed',
        );
      }

      this.stateMachine.transition('APPLYING');
      const applied = await (this.options.applier ?? this.defaultApplier).apply(result.generated, context);
      this.cooldownUntil = this.now() + this.cooldownMs;
      this.stateMachine.transition('COOLDOWN');
      this.log('adaptation_completed', { generationId });

      return {
        status: 'adaptation_complete',
        component: result.generated,
        restoredState: applied?.restoredState ?? context.currentState ?? {},
        latency: 0,
        reason: 'adaptation applied after validation',
      };
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : 'adaptation failed', context);
    } finally {
      this.generationInFlight = false;
      this.activeGenerationId = undefined;
    }
  }

  private readonly defaultValidator: ValidationPort = {
    validate: (generated) => {
      const result = validateGeneratedUI(generated);
      return { ...result, warnings: [] };
    },
  };

  private readonly defaultApplier: ApplyPort = {
    apply: (_generated, context) => ({ restoredState: context.currentState ?? {} }),
  };

  private validateInput(score: CognitiveScore, context: OrchestratorContext): AdaptationResult | undefined {
    if (!Number.isFinite(score.score) || score.score < 0 || score.score > 1) {
      return this.failure('invalid cognitive score', context, 'adaptation_failed', false);
    }
    if (!Number.isFinite(score.threshold) || score.threshold < 0 || score.threshold > 1) {
      return this.failure('invalid cognitive threshold', context, 'adaptation_failed', false);
    }
    if (!Number.isFinite(score.timestamp)) {
      return this.failure('invalid cognitive timestamp', context, 'adaptation_failed', false);
    }
    if (context.sessionId !== undefined && context.sessionId.length === 0) {
      return this.failure('invalid session id', context, 'adaptation_failed', false);
    }
    return undefined;
  }

  private failure(
    reason: string,
    context: OrchestratorContext,
    status: AdaptationResult['status'] = 'adaptation_failed',
    transition = true,
  ): AdaptationResult {
    if (transition && this.stateMachine.state !== 'FAILED') this.stateMachine.transition('FAILED');
    this.log('adaptation_failed', { reason });
    return { status, reason, restoredState: context.currentState ?? {} };
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
