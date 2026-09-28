export type AdaptationResult = {
  status: 'no_adaptation' | 'adaptation_started' | 'adaptation_failed' | 'validation_failed' | 'adaptation_complete';
  component?: string;
  restoredState?: Record<string, unknown>;
  latency?: number;
  reason?: string;
};
