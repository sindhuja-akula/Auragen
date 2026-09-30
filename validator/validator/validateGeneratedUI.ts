import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import type { ValidationResult } from '../../shared/contracts/validation.js';

export function validateGeneratedUI(generated: GeneratedUI): ValidationResult {
  if (!generated.code || generated.code.trim().length === 0) {
    return { valid: false, errors: ['Empty source'], warnings: [] };
  }

  return { valid: true, errors: [], warnings: [] };
}
