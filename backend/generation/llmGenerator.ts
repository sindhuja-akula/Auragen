import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import { PromptBuilder } from './promptBuilder.js';
import { LLMClient } from './llmClient.js';
import { GenerationValidator } from './generationValidator.js';

export interface ILLMGenerator {
  generate(request: RedesignRequest): Promise<GeneratedUI>;
}

export class LLMGenerator implements ILLMGenerator {
  private client: LLMClient;

  constructor(client?: LLMClient) {
    this.client = client || new LLMClient();
  }

  async generate(request: RedesignRequest): Promise<GeneratedUI> {
    // 1. Build prompt from canonical RedesignRequest
    const { systemPrompt, userPrompt } = PromptBuilder.preparePrompt(request);

    // 2. Call LLM client and measure latency
    const { rawResponse, latencyMs } = await this.client.call(systemPrompt, userPrompt);

    // 3. Resolve target component name safely
    let targetName = "AdaptedComponent";
    if (request.currentUI) {
      if (typeof request.currentUI.name === 'string') {
        targetName = request.currentUI.name;
      } else if (typeof request.currentUI === 'string') {
        targetName = request.currentUI;
      }
    }

    // 4. Construct candidate object
    const candidate = {
      code: rawResponse.code,
      componentName: rawResponse.componentName || targetName,
      dependencies: rawResponse.dependencies || ["react"],
      metadata: {
        sessionId: request.sessionId || "unknown",
        adaptationId: `adapt_${Date.now()}`,
        cognitiveSignals: request.cognitiveSignals || [],
        rationale: rawResponse.rationale || "Adapted layout to lower cognitive difficulty.",
        generationLatencyMs: latencyMs
      }
    };

    // 5. Perform basic structural contract validation (stops at GeneratedUI boundary)
    return GenerationValidator.validate(candidate);
  }
}