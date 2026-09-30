export function parseCode(source: string) {
  return {
    type: 'Program',
    source,
    body: [],
  };
}
