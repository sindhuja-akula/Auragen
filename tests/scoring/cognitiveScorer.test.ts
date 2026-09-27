import { describe, expect, it } from 'vitest';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import { scoreCognitiveLoad } from '../../backend/scoring/cognitiveScorer.js';

const makeEvent = (eventType: string, elementId: string, metadata: Record<string, unknown> = {}): TelemetryEvent => ({
  sessionId: 'session-1',
  timestamp: Date.now(),
  eventType,
  elementId,
  metadata,
});

describe('cognitive scorer', () => {
  it('returns a low score for normal interactions', () => {
    const events = [
      makeEvent('click', 'submit-button'),
      makeEvent('focus', 'email-field'),
    ];

    const result = scoreCognitiveLoad(events);

    expect(result.score).toBeLessThan(0.7);
    expect(result.threshold).toBe(0.7);
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('returns a high score when difficulty signals accumulate', () => {
    const events = [
      makeEvent('click', 'submit-button', { repeated: true }),
      makeEvent('click', 'submit-button', { repeated: true }),
      makeEvent('click', 'submit-button', { repeated: true }),
      makeEvent('hover', 'retry-button', { hesitation: true }),
      makeEvent('click', 'back-button'),
      makeEvent('click', 'submit-button', { attempt: 2 }),
    ];

    const result = scoreCognitiveLoad(events);

    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.signals).toContain('repeated_clicks');
    expect(result.signals).toContain('hesitation');
  });

  it('uses the provided threshold for boundary logic', () => {
    const result = scoreCognitiveLoad([], 0.5);
    expect(result.threshold).toBe(0.5);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('ignores invalid telemetry events', () => {
    const badEvents = [
      { sessionId: '', timestamp: Date.now(), eventType: 'click', elementId: '', metadata: {} },
      { sessionId: 's-1', timestamp: 'bad' as unknown as number, eventType: 'click', elementId: 'x', metadata: {} },
    ] as unknown as TelemetryEvent[];

    const result = scoreCognitiveLoad(badEvents);
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
  });
});
