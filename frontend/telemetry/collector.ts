import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';

export class TelemetryCollector {
  constructor(private readonly sessionId = 'test-session') {}

  collect(
    eventType: string,
    elementId: string,
    metadata: Record<string, unknown> = {},
  ): TelemetryEvent {
    return {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      eventType,
      elementId,
      metadata,
    };
  }
}
