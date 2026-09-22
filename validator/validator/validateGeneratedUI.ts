export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateGeneratedUI(source: string): ValidationResult {
  if (!source || source.trim().length === 0) {
    return { valid: false, errors: ['Empty source'] };
  }

  return { valid: true, errors: [] };
}
