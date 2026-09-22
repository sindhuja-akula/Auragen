export type CognitiveScore = {
  clarity: number;
  efficiency: number;
  trust: number;
};

export function scoreCognitiveLoad(metrics: Record<string, number>): CognitiveScore {
  return {
    clarity: metrics.clarity ?? 0,
    efficiency: metrics.efficiency ?? 0,
    trust: metrics.trust ?? 0,
  };
}
