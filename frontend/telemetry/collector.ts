export type TelemetryEvent = {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
};

export class TelemetryCollector {
  collect(eventType: string, payload: Record<string, unknown> = {}): TelemetryEvent {
    return {
      type: eventType,
      payload,
      timestamp: Date.now(),
    };
  }
}
