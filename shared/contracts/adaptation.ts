import type { GeneratedUI } from './generated-ui.js';

export type AdaptationStatus =
  | 'no_adaptation'
  | 'adaptation_started'
  | 'adaptation_failed'
  | 'validation_failed'
  | 'adaptation_complete';

export type AdaptationResult = {
  status: AdaptationStatus;
  component?: string;
  generatedUI?: GeneratedUI;
  restoredState?: Record<string, unknown>;
  latency?: number;
  reason?: string;
  targetElementId?: string;
};
