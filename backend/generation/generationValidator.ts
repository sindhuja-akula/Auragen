import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';

export class GenerationValidator {
  static validate(data: unknown): GeneratedUI {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(
        'Validation Error: Generated response must be a non-null object.',
      );
    }

    const candidate = data as Record<string, unknown>;

    if (
      typeof candidate.code !== 'string' ||
      candidate.code.trim() === ''
    ) {
      throw new Error(
        "Validation Error: 'code' must be a non-empty string.",
      );
    }

    if (
      typeof candidate.componentName !== 'string' ||
      candidate.componentName.trim() === ''
    ) {
      throw new Error(
        "Validation Error: 'componentName' must be a non-empty string.",
      );
    }

    if (!Array.isArray(candidate.dependencies)) {
      throw new Error(
        "Validation Error: 'dependencies' must be an array.",
      );
    }

    for (const dependency of candidate.dependencies) {
      if (
        typeof dependency !== 'string' ||
        dependency.trim() === ''
      ) {
        throw new Error(
          "Validation Error: Every element in 'dependencies' must be a non-empty string.",
        );
      }
    }

    if (
      candidate.metadata === null ||
      typeof candidate.metadata !== 'object' ||
      Array.isArray(candidate.metadata)
    ) {
      throw new Error(
        "Validation Error: 'metadata' must be a non-null object.",
      );
    }

    return {
      code: candidate.code,
      componentName: candidate.componentName,
      dependencies: candidate.dependencies,
      metadata: candidate.metadata as Record<string, unknown>,
    };
  }
}