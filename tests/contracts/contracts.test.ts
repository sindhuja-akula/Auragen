import { describe, expect, it } from 'vitest';
import type { AdaptationResult } from '../../shared/contracts/adaptation.js';
import type { CognitiveScore } from '../../shared/contracts/cognitive.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { ValidationResult } from '../../shared/contracts/validation.js';

describe('shared contract compatibility', () => {
  it('accepts the frozen contract shapes', () => {
    const event: TelemetryEvent = {
      sessionId: 'test-session',
      timestamp: Date.now(),
      eventType: 'interaction',
      elementId: 'submit',
      metadata: {},
    };
    const score: CognitiveScore = {
      score: 0.85,
      threshold: 0.8,
      signals: ['hesitation'],
      timestamp: Date.now(),
    };
    const request: RedesignRequest = {
      sessionId: event.sessionId,
      currentUI: {},
      cognitiveSignals: score.signals,
      currentState: {},
      allowedComponents: ['Button', 'Input'],
    };
    const generated: GeneratedUI = {
      code: 'const SimplifiedForm = () => null;',
      componentName: 'SimplifiedForm',
      dependencies: [],
      metadata: {},
    };
    const validation: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };
    const result: AdaptationResult = {
      status: 'adaptation_complete',
      component: generated.componentName,
      restoredState: {},
      latency: 800,
    };

    expect(event.eventType).toBe('interaction');
    expect(request.cognitiveSignals).toEqual(['hesitation']);
    expect(generated.componentName).toBe('SimplifiedForm');
    expect(validation.valid).toBe(true);
    expect(result.component).toBe('SimplifiedForm');
  });
});
