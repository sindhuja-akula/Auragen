export type CognitiveSignal =
  | 'repeated_clicks'
  | 'hesitation'
  | 'backtracking'
  | 'failed_attempts'
  | 'normal_flow';

export type CognitiveScore = {
  score: number;
  threshold: number;
  signals: string[];
  timestamp: number;
};
