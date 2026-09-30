import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';

const SESSION_STORAGE_KEY = 'auragen.sessionId';
let fallbackSessionId: string | undefined;

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(): string {
  try {
    if (typeof window !== 'undefined') {
      const existingSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existingSessionId) return existingSessionId;

      const sessionId = createSessionId();
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      return sessionId;
    }
  } catch {
    return (fallbackSessionId ??= createSessionId());
  }

  return (fallbackSessionId ??= createSessionId());
}

export class TelemetryCollector {
  private readonly sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? getSessionId();
  }

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
