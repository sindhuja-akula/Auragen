import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export type LLMResponse = {
  parsed: unknown;
  latencyMs: number;
};

export function extractJson(content: string): unknown {
  let cleaned = content.trim();

  // Strip markdown code fences if present anywhere
  cleaned = cleaned.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Extract from the outermost braces { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // If parsing fails due to malformed unicode escape sequence like \u without 4 hex digits, sanitize it
    try {
      const sanitized = cleaned.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
      return JSON.parse(sanitized);
    } catch {
      // Try to repair raw unescaped newlines/tabs inside JSON string literals
      try {
        let inString = false;
        let escaped = false;
        let repaired = '';
        for (let i = 0; i < cleaned.length; i++) {
          const char = cleaned[i];
          if (escaped) {
            repaired += char;
            escaped = false;
            continue;
          }
          if (char === '\\') {
            escaped = true;
            repaired += char;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            repaired += char;
            continue;
          }
          if (inString) {
            if (char === '\n') {
              repaired += '\\n';
              continue;
            }
            if (char === '\r') {
              repaired += '\\r';
              continue;
            }
            if (char === '\t') {
              repaired += '\\t';
              continue;
            }
          }
          repaired += char;
        }
        return JSON.parse(repaired);
      } catch {
        throw err;
      }
    }
  }
}

const VALID_GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'allam-2-7b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
];

function resolveModel(): string {
  const env = process.env.MODEL_NAME;
  if (env && env.trim().length > 0) {
    const trimmed = env.trim();
    if (VALID_GROQ_MODELS.includes(trimmed)) {
      return trimmed;
    }
    console.warn(
      `[LLMClient] MODEL_NAME="${trimmed}" is not in list. Using openai/gpt-oss-20b.`,
    );
  }
  return 'openai/gpt-oss-20b';
}

export class LLMClient {
  private readonly groq: Groq;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Configuration Error: GROQ_API_KEY environment variable is missing.',
      );
    }

    this.groq = new Groq({ apiKey });
    this.model = resolveModel();
    console.log(`[LLMClient] Using model: ${this.model}`);
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    adaptationId?: string,
  ): Promise<LLMResponse> {
    const id = adaptationId ?? 'unknown';
    const startTime = performance.now();
    const maxAttempts = 2; // Bounded retry: 1 initial attempt + 1 retry

    console.log(`[ADAPTATION][${id}] GROQ_REQUEST_STARTED model=${this.model} promptLength=${systemPrompt.length + userPrompt.length}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.groq.chat.completions.create({
          model: this.model,
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
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        });

        const choice = response?.choices?.[0];
        const content = choice?.message?.content;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          if (attempt < maxAttempts) {
            // Wait briefly before bounded retry
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          }
          throw new Error('Provider Error: Received empty response from Groq.');
        }

        let parsed: unknown;
        try {
          parsed = extractJson(content);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown JSON parsing error';

          console.error(`[ADAPTATION][${id}] GROQ_PARSE_FAILURE attempt=${attempt} reason="${message}" rawLength=${content.length}`);
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            continue;
          }
          throw new Error(
            `Parsing Error: LLM returned invalid JSON: ${message}`,
          );
        }

        const latencyMs = Math.round(performance.now() - startTime);

        console.log(`[ADAPTATION][${id}] GROQ_RESPONSE_RECEIVED latencyMs=${latencyMs} responseLength=${content.length}`);

        return {
          parsed,
          latencyMs,
        };
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.startsWith('Configuration Error') ||
           (attempt >= maxAttempts && error.message.includes('Received empty response')) ||
           (attempt >= maxAttempts && error.message.startsWith('Parsing Error')))
        ) {
          throw error;
        }

        if (attempt < maxAttempts) {
          console.warn(`[ADAPTATION][${id}] GROQ_RETRY attempt=${attempt} error=${error instanceof Error ? error.message : String(error)}`);
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }

        console.error(`[ADAPTATION][${id}] GROQ_FAILURE attempt=${attempt} error=${error instanceof Error ? error.message : String(error)}`);

        if (error instanceof Error) {
          throw error;
        }

        throw new Error('LLM Generation Failed: Unknown provider error.');
      }
    }

    throw new Error('Provider Error: Received empty response from Groq.');
  }
}