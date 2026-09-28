import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { ClientMessage, ClientMessageType } from '../../shared/contracts/websocket.js';

export function formatMessage(type: ClientMessageType, payload: unknown): ClientMessage {
  return { type, payload };
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    typeof event.sessionId === 'string' &&
    event.sessionId.length > 0 &&
    typeof event.timestamp === 'number' &&
    Number.isFinite(event.timestamp) &&
    typeof event.eventType === 'string' &&
    event.eventType.length > 0 &&
    typeof event.elementId === 'string' &&
    event.elementId.length > 0 &&
    typeof event.metadata === 'object' &&
    event.metadata !== null &&
    !Array.isArray(event.metadata)
  );
}

export function parseClientMessage(
  raw: string,
): { ok: true; message: ClientMessage } | { ok: false; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Invalid JSON' };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'Message must be an object' };
  }

  const message = value as Record<string, unknown>;
  if (typeof message.type !== 'string') {
    return { ok: false, reason: 'Message type must be a string' };
  }

  if (message.type !== 'telemetry' && message.type !== 'redesign_request') {
    return { ok: false, reason: `Unknown message type: ${message.type}` };
  }

  return {
    ok: true,
    message: { type: message.type, payload: message.payload },
  };
}
