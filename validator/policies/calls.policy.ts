export function validateCalls(calls: string[]) {
  return calls.every((name) => typeof name === 'string' && name.length > 0);
}
