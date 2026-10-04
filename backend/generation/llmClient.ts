import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export type LLMResponse = {
  parsed: unknown;
  latencyMs: number;
};

export class LLMClient {
  private readonly groq: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Configuration Error: GROQ_API_KEY environment variable is missing.',
      );
    }

    this.groq = new Groq({ apiKey });
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<LLMResponse> {
    const startTime = performance.now();

    try {
      const response = await this.groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      const content = response.choices[0]?.message?.content;

      if (!content || typeof content !== 'string') {
        throw new Error('Provider Error: Received empty response from Groq.');
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(content.trim());
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown JSON parsing error';

        throw new Error(
          `Parsing Error: LLM returned invalid JSON: ${message}`,
        );
      }

      return {
        parsed,
        latencyMs,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error('LLM Generation Failed: Unknown provider error.');
    }
  }
}