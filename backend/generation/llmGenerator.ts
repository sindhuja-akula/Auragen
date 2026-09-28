import type { RedesignRequest } from '../../shared/contracts/redesign.js';

export class LLMGenerator {
  generate(request: RedesignRequest) {
    return {
      signals: request.cognitiveSignals,
      context: request,
      generated: 'placeholder-ui',
    };
  }
}
