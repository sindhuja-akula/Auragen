export function serializeState(state: Record<string, unknown>) {
  return JSON.stringify(state);
}

export function deserializeState(raw: string) {
  return JSON.parse(raw) as Record<string, unknown>;
}
