import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';

const DEFAULT_THRESHOLD = 0.7;

function isValidTelemetryEvent(event: unknown): event is TelemetryEvent {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return false;
  }

  const record = event as Record<string, unknown>;
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : '';
  const timestamp = typeof record.timestamp === 'number' ? record.timestamp : Number.NaN;
  const eventType = typeof record.eventType === 'string' ? record.eventType : '';
  const elementId = typeof record.elementId === 'string' ? record.elementId : '';
  const metadata = record.metadata;

  return sessionId.length > 0 &&
    Number.isFinite(timestamp) &&
    eventType.length > 0 &&
    elementId.length > 0 &&
    typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata);
}

export function scoreCognitiveLoad(
  events: TelemetryEvent[] = [],
  threshold = DEFAULT_THRESHOLD,
): CognitiveScore {
  const validEvents = events.filter(isValidTelemetryEvent);
  const signals = new Set<string>();

  const counts = new Map<string, number>();
  for (const event of validEvents) {
    const key = `${event.eventType}:${event.elementId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);

    const metadata = event.metadata as Record<string, unknown>;
    if (metadata.hesitation === true || metadata.delayMs !== undefined && Number(metadata.delayMs) > 2000) {
      signals.add('hesitation');
    }
    if (metadata.repeated === true || metadata.attempt !== undefined && Number(metadata.attempt) > 1) {
      signals.add('repeated_clicks');
    }
    if (event.elementId.toLowerCase().includes('back') || metadata.backtracking === true) {
      signals.add('backtracking');
    }
    if (metadata.failed === true || metadata.attempt !== undefined && Number(metadata.attempt) > 2) {
      signals.add('failed_attempts');
    }
  }

  for (const repeated of counts.values()) {
    if (repeated >= 3) {
      signals.add('repeated_clicks');
    }
  }

  if (validEvents.length === 0) {
    return {
      score: 0,
      threshold,
      signals: [],
      timestamp: Date.now(),
    };
  }

  if (signals.size === 0) {
    signals.add('normal_flow');
  }

  let score = 0;
  if (signals.has('repeated_clicks')) score += 0.35;
  if (signals.has('hesitation')) score += 0.25;
  if (signals.has('backtracking')) score += 0.2;
  if (signals.has('failed_attempts')) score += 0.2;
  if (signals.has('normal_flow')) score = Math.min(score, 0.2);

  const totalDifficulty = validEvents.length;
  if (totalDifficulty > 0) {
    score += Math.min(totalDifficulty * 0.05, 0.15);
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));

  return {
    score,
    threshold,
    signals: Array.from(signals),
    timestamp: Date.now(),
  };
}
