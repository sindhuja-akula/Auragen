export type RedesignRequest = {
  sessionId: string;
  currentUI: Record<string, unknown>;
  cognitiveSignals: string[];
  currentState: Record<string, unknown>;
  allowedComponents: string[];
};
