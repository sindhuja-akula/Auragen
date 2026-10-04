import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';

import { PromptBuilder } from './promptBuilder.js';
import { LLMClient } from './llmClient.js';
import { GenerationValidator } from './generationValidator.js';

export interface ILLMGenerator {
  generate(request: RedesignRequest): Promise<GeneratedUI>;
}

type LLMClientPort = Pick<LLMClient, 'call'>;

export class LLMGenerator implements ILLMGenerator {
  constructor(
    private readonly client: LLMClientPort = new LLMClient(),
  ) {}

  async generate(request: RedesignRequest): Promise<GeneratedUI> {
    const { systemPrompt, userPrompt } =
      PromptBuilder.preparePrompt(request);

    const { parsed, latencyMs } = await this.client.call(
      systemPrompt,
      userPrompt,
    );

    const generated = GenerationValidator.validate(parsed);

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