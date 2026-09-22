export type TelemetryContract = {
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: number;
};
