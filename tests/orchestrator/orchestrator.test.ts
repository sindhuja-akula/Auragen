import { describe, expect, it, vi } from 'vitest';
import { Orchestrator } from '../../backend/orchestrator/orchestrator.js';
import { TelemetryPipeline } from '../../backend/orchestrator/telemetryPipeline.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';

describe('orchestrator', () => {
  const highScore: CognitiveScore = {
    score: 0.9,
    threshold: 0.7,
    signals: ['repeated_clicks'],
    timestamp: Date.now(),
  };

  it('does not adapt when the score is below threshold', async () => {
    const orchestrator = new Orchestrator();
    const score: CognitiveScore = {
      score: 0.3,
      threshold: 0.7,
      signals: ['normal_flow'],
      timestamp: Date.now(),
    };

    const result = await orchestrator.evaluate(score, { currentUI: { title: 'Home' } });

    expect(result.status).toBe('no_adaptation');
  });

  it('starts adaptation when the score exceeds threshold', async () => {
    const orchestrator = new Orchestrator();
    const score: CognitiveScore = {
      score: 0.9,
      threshold: 0.7,
      signals: ['repeated_clicks', 'hesitation'],
      timestamp: Date.now(),
    };

    const result = await orchestrator.evaluate(score, { currentUI: { title: 'Home' } });

    expect(result.status).toBe('adaptation_started');
  });

  it('prevents concurrent generation when one is already in flight', async () => {
    const orchestrator = new Orchestrator();
    const score: CognitiveScore = {
      score: 0.9,
      threshold: 0.7,
      signals: ['repeated_clicks'],
      timestamp: Date.now(),
    };

    orchestrator.setGenerationInFlight(true);
    const result = await orchestrator.evaluate(score, { currentUI: { title: 'Home' } });

    expect(result.status).toBe('no_adaptation');
  });

  it('holds the generation lock until async generation finishes', async () => {
    let finishGeneration!: (output: { generated: string }) => void;
    const generate = vi.fn(() => new Promise<{ generated: string }>((resolve) => {
      finishGeneration = resolve;
    }));
    const orchestrator = new Orchestrator(5000, { generate });

    const firstRequest = orchestrator.evaluate(highScore);
    expect(orchestrator.currentState).toBe('GENERATING');

    const concurrentRequest = await orchestrator.evaluate(highScore);
    expect(concurrentRequest.reason).toBe('generation already in progress');
    expect(orchestrator.currentState).toBe('GENERATING');
    expect(generate).toHaveBeenCalledTimes(1);

    finishGeneration({ generated: 'placeholder-ui' });
    expect((await firstRequest).status).toBe('adaptation_started');
    expect(orchestrator.currentState).toBe('COOLDOWN');
  });

  it('constructs the shared RedesignRequest for generation', async () => {
    const generate = vi.fn((request: RedesignRequest) => ({ generated: 'placeholder-ui' }));
    const orchestrator = new Orchestrator(5000, { generate });

    await orchestrator.evaluate(highScore, {
      sessionId: 'request-session',
      currentUI: { component: 'form' },
      currentState: { email: 'user@example.test' },
      allowedComponents: ['form', 'input'],
    });

    expect(generate).toHaveBeenCalledWith({
      sessionId: 'request-session',
      currentUI: { component: 'form' },
      cognitiveSignals: ['repeated_clicks'],
      currentState: { email: 'user@example.test' },
      allowedComponents: ['form', 'input'],
    });
  });

  it('releases the generation lock and returns preserved state on failure', async () => {
    const generate = vi.fn(() => { throw new Error('generator unavailable'); });
    const orchestrator = new Orchestrator(5000, { generate });

    const result = await orchestrator.evaluate(highScore, {
      currentState: { email: 'user@example.test' },
    });

    expect(result.status).toBe('adaptation_failed');
    expect(result.restoredState).toEqual({ email: 'user@example.test' });
    expect(orchestrator.currentState).toBe('FAILED');

    const retry = await orchestrator.evaluate({ ...highScore, score: 0.3 });
    expect(retry.status).toBe('no_adaptation');
    expect(orchestrator.currentState).toBe('IDLE');
  });
});

describe('telemetry pipeline', () => {
  const makeEvent = (eventType: string): TelemetryEvent => ({
    sessionId: 'pipeline-session',
    timestamp: Date.now(),
    eventType,
    elementId: 'form-field',
    metadata: { count: 3, value: 9000 },
  });

  it('keeps normal interactions below threshold and does not adapt', async () => {
    const pipeline = new TelemetryPipeline(new Orchestrator(), { log: vi.fn() });

    const result = await pipeline.process(makeEvent('interaction'));

    expect(result.cognitiveScore.score).toBeLessThan(result.cognitiveScore.threshold);
    expect(result.adaptation.status).toBe('no_adaptation');
    expect(result.currentState).toBe('IDLE');
  });

  it('passes accumulated frontend difficulty signals to the orchestrator', async () => {
    const pipeline = new TelemetryPipeline(new Orchestrator(), { log: vi.fn() });

    await pipeline.process(makeEvent('repeated_click'));
    const result = await pipeline.process(makeEvent('long_hesitation'));

    expect(result.cognitiveScore.score).toBeGreaterThanOrEqual(result.cognitiveScore.threshold);
    expect(result.cognitiveScore.signals).toEqual(
      expect.arrayContaining(['repeated_clicks', 'hesitation']),
    );
    expect(result.adaptation.status).toBe('adaptation_started');
    expect(result.currentState).toBe('COOLDOWN');

    const duringCooldown = await pipeline.process(makeEvent('backtracking'));
    expect(duringCooldown.adaptation.status).toBe('no_adaptation');
    expect(duringCooldown.adaptation.reason).toBe('cooldown active');
    expect(duringCooldown.currentState).toBe('COOLDOWN');
  });
});
