import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';

export class GenerationValidator {
  static validate(data: unknown): GeneratedUI {
    if (!data || typeof data !== 'object') {
      throw new Error("Validation Error: Generated response must be a non-null object.");
    }

    const candidate = data as Record<string, unknown>;

    if (typeof candidate.code !== 'string' || candidate.code.trim() === '') {
      throw new Error("Validation Error: 'code' must be a non-empty string.");
    }

    if (typeof candidate.componentName !== 'string' || candidate.componentName.trim() === '') {
      throw new Error("Validation Error: 'componentName' must be a non-empty string.");
    }

    if (!Array.isArray(candidate.dependencies)) {
      throw new Error("Validation Error: 'dependencies' must be an array.");
    }

    if (!candidate.metadata || typeof candidate.metadata !== 'object') {
      throw new Error("Validation Error: 'metadata' must be an object.");
    }

    return {
      code: candidate.code,
      componentName: candidate.componentName,
      dependencies: candidate.dependencies as string[],
      metadata: candidate.metadata as Record<string, unknown>
    };
  }
}