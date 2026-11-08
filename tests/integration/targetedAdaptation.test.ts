import { describe, expect, it, vi } from 'vitest';
import { Orchestrator } from '../../backend/orchestrator/orchestrator.js';
import { TelemetryPipeline } from '../../backend/orchestrator/telemetryPipeline.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import { loadControlledComponent } from '../../frontend/renderer/componentLoader.js';

const SIMPLIFIED_EMAIL_UI = `
import React from 'react';

function SimplifiedEmailField({ initialValues, onStateChange }) {
  return (
    <div className="form-group">
      <label htmlFor="email">Email address</label>
      <input
        id="email"
        name="email"
        type="email"
        defaultValue={initialValues?.email || ''}
        placeholder="e.g. name@example.com"
      />
      <span className="field-hint">Example: name@example.com</span>
    </div>
  );
}

export default SimplifiedEmailField;
`;

describe('Targeted In-Place Adaptation Pipeline', () => {
  it('identifies the specific friction target (email) and adapts only that element', async () => {
    let capturedRequest: RedesignRequest | undefined;

    const mockGenerator = {
      generate: vi.fn().mockImplementation(async (req: RedesignRequest) => {
        capturedRequest = req;
        return {
          code: SIMPLIFIED_EMAIL_UI,
          componentName: 'SimplifiedEmailField',
          dependencies: ['react'],
          metadata: { targeted: true },
        } as GeneratedUI;
      }),
    };

    const orchestrator = new Orchestrator(0, mockGenerator);
    const pipeline = new TelemetryPipeline(orchestrator, { log: () => {} });

    const sessionState = {
      name: 'Sindhuja',
      email: 'invalid-attempt',
      phone: '9876543210',
      accountType: 'developer',
    };

    // User struggles specifically with the email field (repeated clicks + hesitation)
    await pipeline.process({
      sessionId: 'sess-targeted-1',
      timestamp: Date.now(),
      eventType: 'repeated_click',
      elementId: 'email',
      metadata: {
        count: 3,
        formState: sessionState,
      },
    });

    const result = await pipeline.process({
      sessionId: 'sess-targeted-1',
      timestamp: Date.now() + 50,
      eventType: 'long_hesitation',
      elementId: 'email',
      metadata: {
        delayMs: 8500,
        formState: sessionState,
      },
    });

    // 1. Threshold was reached
    expect(result.cognitiveScore.score).toBeGreaterThanOrEqual(result.cognitiveScore.threshold);

    // 2. Target was identified as email
    expect(capturedRequest?.targetElementId).toBe('email');

    // 3. Orchestrator returned adaptation complete for target email
    expect(result.adaptation.status).toBe('adaptation_complete');
    expect(result.adaptation.targetElementId).toBe('email');

    // 4. Other fields in restoredState remain intact
    expect(result.adaptation.restoredState).toMatchObject({
      name: 'Sindhuja',
      phone: '9876543210',
      accountType: 'developer',
    });

    // 5. Generated code safely compiles via AST interpreter without eval/new Function
    const Component = loadControlledComponent(result.adaptation.generatedUI!);
    expect(typeof Component).toBe('function');
  });
});
