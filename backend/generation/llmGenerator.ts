import type { RedesignRequest } from '../../shared/contracts/redesign.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';

export interface LLMGenerator {
  generate(request: RedesignRequest): Promise<GeneratedUI>;
}

export class LLMGenerator implements LLMGenerator {
  async generate(request: RedesignRequest): Promise<GeneratedUI> {
    return {
      code: 'placeholder-ui',
      componentName: 'PlaceholderUI',
      dependencies: [],
      metadata: {
        signals: request.cognitiveSignals,
      },
    };
  }
}
