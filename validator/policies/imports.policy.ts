export function validateImports(imports: string[]) {
  return imports.every((name) => typeof name === 'string' && name.length > 0);
}
