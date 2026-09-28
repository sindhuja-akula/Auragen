import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../../backend/orchestrator/orchestrator.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';

describe('orchestrator', () => {
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
});
