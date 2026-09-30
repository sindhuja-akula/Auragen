import type { AdaptationResult } from '../../shared/contracts/adaptation.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import { scoreCognitiveLoad } from '../scoring/cognitiveScorer.js';
import { Orchestrator } from './orchestrator.js';
import type { StateValue } from './stateMachine.js';

const MAX_EVENTS_PER_SESSION = 20;

export type TelemetryPipelineResult = {
  cognitiveScore: CognitiveScore;
  adaptation: AdaptationResult;
  currentState: StateValue;
};

export class TelemetryPipeline {
  private readonly eventsBySession = new Map<string, TelemetryEvent[]>();

  constructor(
    private readonly orchestrator = new Orchestrator(),
    private readonly logger: Pick<Console, 'log'> = console,
  ) {}

  async process(event: TelemetryEvent): Promise<TelemetryPipelineResult> {
    const events = this.eventsBySession.get(event.sessionId) ?? [];
    events.push(event);
    if (events.length > MAX_EVENTS_PER_SESSION) events.shift();
    this.eventsBySession.set(event.sessionId, events);

    const cognitiveScore = scoreCognitiveLoad(events);
    this.logger.log('[Pipeline] Cognitive score', {
      sessionId: event.sessionId,
      ...cognitiveScore,
    });

    const adaptation = await this.orchestrator.evaluate(cognitiveScore, {
      sessionId: event.sessionId,
      currentUI: { component: 'AuraGenForm' },
      currentState: {},
    });
    this.logger.log('[Pipeline] Adaptation decision', {
      sessionId: event.sessionId,
      score: cognitiveScore.score,
      status: adaptation.status,
      reason: adaptation.reason,
      state: this.orchestrator.currentState,
    });

    return {
      cognitiveScore,
      adaptation,
      currentState: this.orchestrator.currentState,
    };
  }
}