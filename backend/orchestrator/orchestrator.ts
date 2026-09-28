import type { AdaptationResult } from '../../shared/contracts/adaptation.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import { LLMGenerator } from '../generation/llmGenerator.js';
import { StateMachine, type StateValue } from './stateMachine.js';

type GenerationOutput = { generated?: unknown };
type GenerationPort = {
  generate(request: RedesignRequest): GenerationOutput | Promise<GenerationOutput>;
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

  constructor(
    private readonly cooldownMs = 5000,
    private readonly generator: GenerationPort = new LLMGenerator(),
  ) {}

  get currentState(): StateValue {
    return this.stateMachine.state;
  }

  setGenerationInFlight(value: boolean): void {
    this.generationInFlight = value;
  }

  async evaluate(
    score: CognitiveScore,
    context: OrchestratorContext = {},
  ): Promise<AdaptationResult> {
    const now = Date.now();
    if (!this.generationInFlight) {
      if (this.stateMachine.state === 'COOLDOWN' && now >= this.cooldownUntil) {
        this.stateMachine.transition('IDLE');
      }
      this.stateMachine.transition('DETECTING');
    }

    if (score.score < (score.threshold ?? 0.7)) {
      if (!this.generationInFlight) this.stateMachine.transition('IDLE');
      return {
        status: 'no_adaptation',
        reason: 'score below threshold',
        restoredState: context.currentState ?? {},
      };
    }

    if (this.generationInFlight) {
      return {
        status: 'no_adaptation',
        reason: 'generation already in progress',
        restoredState: context.currentState ?? {},
      };
    }

    if (now < this.cooldownUntil) {
      this.stateMachine.transition('COOLDOWN');
      return {
        status: 'no_adaptation',
        reason: 'cooldown active',
        restoredState: context.currentState ?? {},
      };
    }

    this.stateMachine.transition('ADAPTATION_REQUESTED');
    this.generationInFlight = true;

    const request: RedesignRequest = {
      sessionId: context.sessionId ?? 'session-1',
      currentUI: context.currentUI ?? { title: 'safe-ui' },
      cognitiveSignals: score.signals,
      currentState: context.currentState ?? { mode: 'default' },
      allowedComponents: context.allowedComponents ?? ['button', 'card', 'form'],
    };

    this.stateMachine.transition('GENERATING');

    try {
      const result = await this.generator.generate(request);

      if (!result || !result.generated || typeof result.generated !== 'string') {
        throw new Error('Generation failed');
      }

      this.cooldownUntil = Date.now() + this.cooldownMs;
      this.stateMachine.transition('COOLDOWN');

      return {
        status: 'adaptation_started',
        component: typeof result.generated === 'string' ? result.generated : 'generated-ui',
        latency: 0,
        reason: 'adaptation triggered by high cognitive load',
      };
    } catch (error) {
      this.generationInFlight = false;
      this.stateMachine.transition('FAILED');
      return {
        status: 'adaptation_failed',
        reason: error instanceof Error ? error.message : 'generation failed',
        restoredState: context.currentState ?? {},
      };
    } finally {
      this.generationInFlight = false;
    }
  }

  run() {
    return 'orchestration started';
  }
}
