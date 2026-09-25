export type TelemetryEvent = {
  sessionId: string;
  timestamp: number;
  eventType: string;
  elementId: string;
  metadata: Record<string, unknown>;
};
