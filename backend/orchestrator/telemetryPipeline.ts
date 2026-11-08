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

export type AdaptationStartCallback = (info: { sessionId: string; score: number }) => void;

export class TelemetryPipeline {
  private readonly eventsBySession = new Map<string, TelemetryEvent[]>();
  private readonly stateBySession = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly orchestrator = new Orchestrator(),
    private readonly logger: Pick<Console, 'log'> = console,
  ) {}

  async process(
    event: TelemetryEvent,
    onStarted?: AdaptationStartCallback,
  ): Promise<TelemetryPipelineResult> {
    // ── Stage 1: Telemetry ────────────────────────────────────────────────
    this.logger.log(`[ADAPTATION][pending] [1] TELEMETRY_RECEIVED sessionId="${event.sessionId}" eventType="${event.eventType}" elementId="${event.elementId}" metadata=${JSON.stringify(event.metadata)}`);

    const events = this.eventsBySession.get(event.sessionId) ?? [];
    events.push(event);
    if (events.length > MAX_EVENTS_PER_SESSION) events.shift();
    this.eventsBySession.set(event.sessionId, events);

    if (
      event.metadata &&
      typeof event.metadata === 'object' &&
      typeof event.metadata.formState === 'object' &&
      event.metadata.formState !== null &&
      !Array.isArray(event.metadata.formState)
    ) {
      const existingState = this.stateBySession.get(event.sessionId) ?? {};
      this.stateBySession.set(event.sessionId, {
        ...existingState,
        ...(event.metadata.formState as Record<string, unknown>),
      });
    }

    // ── Stage 2: Cognitive Scoring ────────────────────────────────────────
    const cognitiveScore = scoreCognitiveLoad(events);
    const triggered = cognitiveScore.score >= cognitiveScore.threshold;

    this.logger.log(`[ADAPTATION][pending] [2] COGNITIVE_SCORE score=${cognitiveScore.score.toFixed(3)} threshold=${cognitiveScore.threshold} signals=${JSON.stringify(cognitiveScore.signals)} eventsInWindow=${events.length} TRIGGERED=${triggered ? 'YES' : 'NO'}`);

    if (triggered) {
      onStarted?.({
        sessionId: event.sessionId,
        score: cognitiveScore.score,
      });
    }

    const sessionState = this.stateBySession.get(event.sessionId) ?? {};

    // Identify target element from telemetry friction
    let targetElementId = event.elementId;
    if (
      event.metadata &&
      typeof event.metadata === 'object' &&
      typeof (event.metadata as Record<string, unknown>).targetElementId === 'string'
    ) {
      targetElementId = (event.metadata as Record<string, unknown>).targetElementId as string;
    } else if (targetElementId === 'continue' || targetElementId === 'submit-button' || targetElementId === 'continue-button') {
      const frictionEvent = [...events]
        .reverse()
        .find((e) => e.elementId && e.elementId !== 'continue' && e.elementId !== 'submit-button' && e.elementId !== 'continue-button');
      if (frictionEvent) {
        targetElementId = frictionEvent.elementId;
      }
    }

    this.logger.log(`[ADAPTATION][pending] [3] ORCHESTRATOR_EVALUATE target="${targetElementId}" sessionId="${event.sessionId}"`);

    const adaptation = await this.orchestrator.evaluate(cognitiveScore, {
      sessionId: event.sessionId,
      currentUI: { component: 'AuraGenForm' },
      currentState: sessionState,
      targetElementId,
    });

    this.logger.log(`[ADAPTATION][pending] [3] ORCHESTRATOR_RESULT status="${adaptation.status}" reason="${adaptation.reason ?? 'none'}" state=${this.orchestrator.currentState}`);

    return {
      cognitiveScore,
      adaptation,
      currentState: this.orchestrator.currentState,
    };
  }
}