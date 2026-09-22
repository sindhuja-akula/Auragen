export function generationGuard(code: string) {
  if (!code || code.trim().length === 0) {
    throw new Error('Generated code is empty');
  }

  return true;
}
