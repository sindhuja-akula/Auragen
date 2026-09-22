export function validateGlobals(globals: string[]) {
  return globals.every((name) => typeof name === 'string' && name.length > 0);
}
