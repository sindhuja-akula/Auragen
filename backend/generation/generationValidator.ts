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

    // Validate that every element in dependencies is a string
    for (const dep of candidate.dependencies) {
      if (typeof dep !== 'string' || dep.trim() === '') {
        throw new Error("Validation Error: Every element in 'dependencies' must be a non-empty string.");
      }
    }

    if (!candidate.metadata || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
      throw new Error("Validation Error: 'metadata' must be a non-null object.");
    }

    return {
      code: candidate.code,
      componentName: candidate.componentName,
      dependencies: candidate.dependencies as string[],
      metadata: candidate.metadata as Record<string, unknown>
    };
  }
}