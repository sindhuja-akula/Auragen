import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';

import { PromptBuilder } from './promptBuilder.js';
import { LLMClient } from './llmClient.js';
import { GenerationValidator } from './generationValidator.js';

export interface ILLMGenerator {
  generate(request: RedesignRequest, adaptationId?: string): Promise<GeneratedUI>;
}

type LLMClientPort = Pick<LLMClient, 'call'>;

export class LLMGenerator implements ILLMGenerator {
  constructor(
    private readonly client: LLMClientPort = new LLMClient(),
  ) {}

  async generate(request: RedesignRequest, adaptationId?: string): Promise<GeneratedUI> {
    const id = adaptationId ?? 'unknown';
    const { systemPrompt, userPrompt } =
      PromptBuilder.preparePrompt(request);

    const { parsed, latencyMs } = await this.client.call(
      systemPrompt,
      userPrompt,
      id,
    );

    console.log(`[ADAPTATION][${id}] GENERATION_VALIDATOR_START`);
    let generated: GeneratedUI;
    try {
      generated = GenerationValidator.validate(parsed);
    } catch (err) {
      console.error(`[ADAPTATION][${id}] GENERATION_VALIDATOR_FAIL reason="${err instanceof Error ? err.message : String(err)}"`);
      throw err;
    }

    console.log(`[ADAPTATION][${id}] GENERATION_VALIDATOR_PASS componentName="${generated.componentName}" codeLength=${generated.code.length} deps=${JSON.stringify(generated.dependencies)}`);

    return {
      code: generated.code,
      componentName: generated.componentName,
      dependencies: generated.dependencies,
      metadata: {
        ...generated.metadata,
        generationLatencyMs: latencyMs,
      },
    };
  }
}