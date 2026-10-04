import { describe, expect, it, vi } from 'vitest';

import { LLMGenerator } from '../../backend/generation/llmGenerator.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';

const request: RedesignRequest = {
  sessionId: 'test-session',
  currentUI: {
    name: 'payment_form',
  },
  cognitiveSignals: ['hesitation'],
  currentState: {
    amount: 150,
  },
  allowedComponents: ['div', 'button', 'input'],
};

describe('LLMGenerator', () => {
  it('generates a valid GeneratedUI result', async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({
        parsed: {
          code: 'return <div>Simple UI</div>;',
          componentName: 'SimplePaymentUI',
          dependencies: ['react'],
          metadata: {},
        },
        latencyMs: 125,
      }),
    };

    const generator = new LLMGenerator(mockClient);

    const result = await generator.generate(request);

    expect(result).toEqual({
      code: 'return <div>Simple UI</div>;',
      componentName: 'SimplePaymentUI',
      dependencies: ['react'],
      metadata: {
        generationLatencyMs: 125,
      },
    });

    expect(mockClient.call).toHaveBeenCalledOnce();
  });

  it('passes the generated result through validation', async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({
        parsed: {
          code: 'return <div />;',
          componentName: 'TestUI',
          dependencies: [],
          metadata: {},
        },
        latencyMs: 100,
      }),
    };

    const generator = new LLMGenerator(mockClient);

    const result = await generator.generate(request);

    expect(result.code).toBe('return <div />;');
    expect(result.componentName).toBe('TestUI');
  });

  it('propagates LLM client failures', async () => {
    const mockClient = {
      call: vi.fn().mockRejectedValue(
        new Error('Provider failure'),
      ),
    };

    const generator = new LLMGenerator(mockClient);

    await expect(
      generator.generate(request),
    ).rejects.toThrow('Provider failure');
  });

  it('records generation latency in metadata', async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue({
        parsed: {
          code: 'return <div />;',
          componentName: 'TestUI',
          dependencies: [],
          metadata: {
            source: 'test',
          },
        },
        latencyMs: 347,
      }),
    };

    const generator = new LLMGenerator(mockClient);

    const result = await generator.generate(request);

    expect(result.metadata).toEqual({
      source: 'test',
      generationLatencyMs: 347,
    });
  });
});