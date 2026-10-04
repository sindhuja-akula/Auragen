import { describe, expect, it, vi } from 'vitest';

import { Orchestrator } from '../../backend/orchestrator/orchestrator.js';
import { TelemetryPipeline } from '../../backend/orchestrator/telemetryPipeline.js';

import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';

const makeGeneratedUI = (
  code = 'placeholder-ui',
  componentName = 'PlaceholderUI',
): GeneratedUI => ({
  code,
  componentName,
  dependencies: [],
  metadata: {},
});

describe('orchestrator', () => {
  const highScore: CognitiveScore = {
    score: 0.9,
    threshold: 0.7,
    signals: ['repeated_clicks'],
    timestamp: Date.now(),
  };

  it('does not call the generator when the score is below threshold', async () => {
    const generate = vi.fn(async () => makeGeneratedUI());

    const orchestrator = new Orchestrator(5000, { generate });

    const score: CognitiveScore = {
      score: 0.3,
      threshold: 0.7,
      signals: ['normal_flow'],
      timestamp: Date.now(),
    };

    const result = await orchestrator.evaluate(score, {
      currentUI: { title: 'Home' },
    });

    expect(result.status).toBe('no_adaptation');
    expect(generate).not.toHaveBeenCalled();
  });

  it('starts adaptation when the score exceeds threshold', async () => {
    const generate = vi.fn(async () => makeGeneratedUI());

    const orchestrator = new Orchestrator(5000, { generate });

    const score: CognitiveScore = {
      score: 0.9,
      threshold: 0.7,
      signals: ['repeated_clicks', 'hesitation'],
      timestamp: Date.now(),
    };

    const result = await orchestrator.evaluate(score, {
      currentUI: { title: 'Home' },
    });

    expect(result.status).toBe('adaptation_complete');
    expect(generate).toHaveBeenCalledTimes(1);
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

    const result = await orchestrator.evaluate(score, {
      currentUI: { title: 'Home' },
    });

    expect(result.status).toBe('no_adaptation');
  });

  it('holds the generation lock until async generation finishes', async () => {
    let finishGeneration!: (output: GeneratedUI) => void;

    const generate = vi.fn(
      () =>
        new Promise<GeneratedUI>((resolve) => {
          finishGeneration = resolve;
        }),
    );

    const orchestrator = new Orchestrator(5000, { generate });

    const firstRequest = orchestrator.evaluate(highScore);

    expect(orchestrator.currentState).toBe('GENERATING');

    const concurrentRequest = await orchestrator.evaluate(highScore);

    expect(concurrentRequest.reason).toBe('generation already in progress');
    expect(orchestrator.currentState).toBe('GENERATING');
    expect(generate).toHaveBeenCalledTimes(1);

    finishGeneration(makeGeneratedUI());

    expect((await firstRequest).status).toBe('adaptation_complete');
    expect(orchestrator.currentState).toBe('COOLDOWN');
  });

  it('constructs the shared RedesignRequest for generation', async () => {
    const generate = vi.fn(
      (request: RedesignRequest): GeneratedUI => {
        return makeGeneratedUI();
      },
    );

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
    const generate = vi.fn(() => {
      throw new Error('generator unavailable');
    });

    const orchestrator = new Orchestrator(5000, { generate });

    const result = await orchestrator.evaluate(highScore, {
      currentState: { email: 'user@example.test' },
    });

    expect(result.status).toBe('adaptation_failed');
    expect(result.restoredState).toEqual({
      email: 'user@example.test',
    });
    expect(orchestrator.currentState).toBe('FAILED');

    const retry = await orchestrator.evaluate({
      ...highScore,
      score: 0.3,
    });

    expect(retry.status).toBe('no_adaptation');
    expect(orchestrator.currentState).toBe('IDLE');
  });

  it('adapts at a score equal to the threshold', async () => {
    const generate = vi.fn(() => makeGeneratedUI());

    const orchestrator = new Orchestrator(5000, { generate });

    const result = await orchestrator.evaluate({
      ...highScore,
      score: 0.7,
    });

    expect(result.status).toBe('adaptation_complete');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('blocks high evidence during cooldown and retries after deterministic expiry', async () => {
    let now = 1000;

    const generate = vi.fn(() => makeGeneratedUI());

    const orchestrator = new Orchestrator(
      1000,
      { generate },
      { now: () => now },
    );

    await orchestrator.evaluate(highScore);

    const blocked = await orchestrator.evaluate({
      ...highScore,
      score: 0.95,
    });

    expect(blocked.reason).toBe('cooldown active');
    expect(generate).toHaveBeenCalledTimes(1);

    now = 2000;

    const retried = await orchestrator.evaluate({
      ...highScore,
      score: 0.95,
    });

    expect(retried.status).toBe('adaptation_complete');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('retains the latest evidence without starting a second generation', async () => {
    let finishGeneration!: (output: GeneratedUI) => void;

    const generate = vi.fn(
      () =>
        new Promise<GeneratedUI>((resolve) => {
          finishGeneration = resolve;
        }),
    );

    const orchestrator = new Orchestrator(5000, { generate });

    const first = orchestrator.evaluate(highScore);

    const second = await orchestrator.evaluate({
      ...highScore,
      score: 0.98,
    });

    expect(second.reason).toBe('generation already in progress');
    expect(orchestrator.latestScore?.score).toBe(0.98);
    expect(generate).toHaveBeenCalledTimes(1);

    finishGeneration(makeGeneratedUI());

    await first;
  });

  it('times out a hung generation and releases the lock for recovery', async () => {
    vi.useFakeTimers();

    try {
      const generate = vi.fn(
        () => new Promise<GeneratedUI>(() => undefined),
      );

      const orchestrator = new Orchestrator(
        5000,
        { generate },
        { generationTimeoutMs: 100 },
      );

      const pending = orchestrator.evaluate(highScore);

      await vi.advanceTimersByTimeAsync(100);

      const timedOut = await pending;

      expect(timedOut.status).toBe('adaptation_failed');
      expect(timedOut.reason).toBe('generation timeout');
      expect(orchestrator.currentState).toBe('FAILED');

      generate.mockResolvedValueOnce(
        makeGeneratedUI('recovered-code', 'RecoveredUI'),
      );

      const recovered = await orchestrator.evaluate({
        ...highScore,
        score: 0.91,
      });

      expect(recovered.status).toBe('adaptation_complete');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects invalid generated code and preserves the current state', async () => {
    const generate = vi.fn(() =>
      makeGeneratedUI('', 'InvalidUI'),
    );

    const orchestrator = new Orchestrator(5000, { generate });

    const result = await orchestrator.evaluate(highScore, {
      currentState: { email: 'kept' },
    });

    expect(result.status).toBe('validation_failed');
    expect(result.restoredState).toEqual({
      email: 'kept',
    });
    expect(orchestrator.currentState).toBe('FAILED');
  });

  it('does not apply validation failures and remains recoverable', async () => {
    const generate = vi.fn(() =>
      makeGeneratedUI('unsafe-code', 'UnsafeUI'),
    );

    const apply = vi.fn(() => ({
      restoredState: { preserved: true },
    }));

    const validate = vi.fn(() => ({
      valid: false,
      errors: ['unsafe call'],
      warnings: [],
    }));

    const orchestrator = new Orchestrator(
      5000,
      { generate },
      {
        validator: { validate },
        applier: { apply },
      },
    );

    const rejected = await orchestrator.evaluate(highScore);

    expect(rejected.status).toBe('validation_failed');
    expect(apply).not.toHaveBeenCalled();
    expect(orchestrator.currentState).toBe('FAILED');

    validate.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    });

    const recovered = await orchestrator.evaluate({
      ...highScore,
      score: 0.92,
    });

    expect(recovered.status).toBe('adaptation_complete');
  });

  it('treats application failure as failed and protects the current UI', async () => {
    const generate = vi.fn(() =>
      makeGeneratedUI('valid-code', 'ValidUI'),
    );

    const apply = vi.fn(() => {
      throw new Error('renderer unavailable');
    });

    const orchestrator = new Orchestrator(
      5000,
      { generate },
      { applier: { apply } },
    );

    const failed = await orchestrator.evaluate(highScore, {
      currentState: { value: 'safe' },
    });

    expect(failed.status).toBe('adaptation_failed');
    expect(failed.restoredState).toEqual({
      value: 'safe',
    });
    expect(orchestrator.currentState).toBe('FAILED');
  });

  it('rejects a timed-out result that arrives after a newer lifecycle starts', async () => {
    vi.useFakeTimers();

    try {
      let finishOld!: (output: GeneratedUI) => void;

      const generate = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<GeneratedUI>((resolve) => {
              finishOld = resolve;
            }),
        )
        .mockImplementationOnce(() =>
          makeGeneratedUI('new-code', 'NewUI'),
        );

      const apply = vi.fn();

      const orchestrator = new Orchestrator(
        0,
        { generate },
        {
          generationTimeoutMs: 100,
          applier: { apply },
        },
      );

      const oldRequest = orchestrator.evaluate(highScore);

      await vi.advanceTimersByTimeAsync(100);

      await oldRequest;

      const newRequest = orchestrator.evaluate({
        ...highScore,
        score: 0.91,
      });

      finishOld(makeGeneratedUI('old-code', 'OldUI'));

      const result = await newRequest;

      expect(result.status).toBe('adaptation_complete');
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith(
        makeGeneratedUI('new-code', 'NewUI'),
        {},
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('telemetry pipeline', () => {
  const makeEvent = (eventType: string): TelemetryEvent => ({
    sessionId: 'pipeline-session',
    timestamp: Date.now(),
    eventType,
    elementId: 'form-field',
    metadata: {
      count: 3,
      value: 9000,
    },
  });

  it('keeps normal interactions below threshold and does not adapt', async () => {
    const generate = vi.fn(async () => makeGeneratedUI());

    const pipeline = new TelemetryPipeline(
      new Orchestrator(5000, { generate }),
      { log: vi.fn() },
    );

    const result = await pipeline.process(
      makeEvent('interaction'),
    );

    expect(result.cognitiveScore.score).toBeLessThan(
      result.cognitiveScore.threshold,
    );

    expect(result.adaptation.status).toBe('no_adaptation');
    expect(result.currentState).toBe('IDLE');
    expect(generate).not.toHaveBeenCalled();
  });

  it('passes accumulated frontend difficulty signals to the orchestrator', async () => {
    const generate = vi.fn(async () => makeGeneratedUI());

    const pipeline = new TelemetryPipeline(
      new Orchestrator(5000, { generate }),
      { log: vi.fn() },
    );

    await pipeline.process(makeEvent('repeated_click'));

    const result = await pipeline.process(
      makeEvent('long_hesitation'),
    );

    expect(result.cognitiveScore.score).toBeGreaterThanOrEqual(
      result.cognitiveScore.threshold,
    );

    expect(result.cognitiveScore.signals).toEqual(
      expect.arrayContaining([
        'repeated_clicks',
        'hesitation',
      ]),
    );

    expect(result.adaptation.status).toBe(
      'adaptation_complete',
    );

    expect(result.currentState).toBe('COOLDOWN');

    const duringCooldown = await pipeline.process(
      makeEvent('backtracking'),
    );

    expect(duringCooldown.adaptation.status).toBe(
      'no_adaptation',
    );

    expect(duringCooldown.adaptation.reason).toBe(
      'cooldown active',
    );

    expect(duringCooldown.currentState).toBe('COOLDOWN');
  });
});