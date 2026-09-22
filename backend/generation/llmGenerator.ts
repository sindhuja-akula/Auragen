export type GenerationRequest = {
  prompt: string;
  context?: Record<string, unknown>;
};

export class LLMGenerator {
  generate(request: GenerationRequest) {
    return {
      prompt: request.prompt,
      context: request.context ?? {},
      generated: 'placeholder-ui',
    };
  }
}
