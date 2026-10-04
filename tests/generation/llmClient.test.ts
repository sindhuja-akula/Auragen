import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('groq-sdk', () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe('LLMClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'test-api-key';
  });

  it('parses a valid JSON response', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              code: 'return <div>Hello</div>;',
              componentName: 'TestUI',
              dependencies: ['react'],
              metadata: {},
            }),
          },
        },
      ],
    });

    const { LLMClient } = await import(
      '../../backend/generation/llmClient.js'
    );

    const client = new LLMClient();

    const result = await client.call(
      'system prompt',
      'user prompt',
    );

    expect(result.parsed).toEqual({
      code: 'return <div>Hello</div>;',
      componentName: 'TestUI',
      dependencies: ['react'],
      metadata: {},
    });

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('rejects invalid JSON', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'this is not valid JSON',
          },
        },
      ],
    });

    const { LLMClient } = await import(
      '../../backend/generation/llmClient.js'
    );

    const client = new LLMClient();

    await expect(
      client.call('system prompt', 'user prompt'),
    ).rejects.toThrow('Parsing Error');
  });

  it('rejects an empty response', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '',
          },
        },
      ],
    });

    const { LLMClient } = await import(
      '../../backend/generation/llmClient.js'
    );

    const client = new LLMClient();

    await expect(
      client.call('system prompt', 'user prompt'),
    ).rejects.toThrow('Provider Error');
  });

  it('propagates provider failures', async () => {
    mockCreate.mockRejectedValue(
      new Error('Network failure'),
    );

    const { LLMClient } = await import(
      '../../backend/generation/llmClient.js'
    );

    const client = new LLMClient();

    await expect(
      client.call('system prompt', 'user prompt'),
    ).rejects.toThrow('Network failure');
  });

  it('sends the correct prompts to the provider', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"code":"test"}',
          },
        },
      ],
    });

    const { LLMClient } = await import(
      '../../backend/generation/llmClient.js'
    );

    const client = new LLMClient();

    await client.call(
      'my system prompt',
      'my user prompt',
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: 'my system prompt',
          },
          {
            role: 'user',
            content: 'my user prompt',
          },
        ],
      }),
    );
  });
});