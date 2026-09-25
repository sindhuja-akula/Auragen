import { once } from 'node:events';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from '../../backend/websocket/server.js';
import { createTelemetryMessage } from '../../frontend/telemetry/websocketClient.js';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';

class TestLogger {
  readonly entries: string[] = [];
  private readonly listeners: Array<(entry: string) => void> = [];

  log = (...values: unknown[]): void => this.record(values[0]);
  error = (...values: unknown[]): void => this.record(values[0]);

  waitFor(text: string): Promise<void> {
    if (this.entries.some((entry) => entry.includes(text))) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.splice(this.listeners.indexOf(listener), 1);
        reject(new Error(`Timed out waiting for log: ${text}`));
      }, 1000);
      const listener = (entry: string): void => {
        if (entry.includes(text)) {
          clearTimeout(timeout);
          this.listeners.splice(this.listeners.indexOf(listener), 1);
          resolve();
        }
      };
      this.listeners.push(listener);
    });
  }

  private record(value: unknown): void {
    const entry = String(value);
    this.entries.push(entry);
    for (const listener of this.listeners) {
      listener(entry);
    }
  }
}

describe('WebSocket telemetry communication', () => {
  let server: WebSocketServer;
  let logger: TestLogger;
  let url: string;
  let client: WebSocket | undefined;

  beforeEach(async () => {
    logger = new TestLogger();
    server = new WebSocketServer(logger);
    url = await server.start({ port: 0 });
  });

  afterEach(async () => {
    client?.close();
    client = undefined;
    await server.stop();
  });

  async function connect(): Promise<WebSocket> {
    client = new WebSocket(url);
    await once(client, 'open');
    return client;
  }

  function sendValidTelemetry(socket: WebSocket): void {
    const event: TelemetryEvent = {
      sessionId: 'test-session',
      timestamp: Date.now(),
      eventType: 'click',
      elementId: 'submit-button',
      metadata: {},
    };
    socket.send(JSON.stringify(createTelemetryMessage(event)));
  }

  it('accepts a browser-shaped telemetry message after connection', async () => {
    const socket = await connect();
    await logger.waitFor('[WS] Client connected');
    sendValidTelemetry(socket);

    await logger.waitFor('[WS] Received telemetry');
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects telemetry missing sessionId', async () => {
    const socket = await connect();
    socket.send(JSON.stringify({
      type: 'telemetry',
      payload: {
        timestamp: Date.now(),
        eventType: 'click',
        elementId: 'submit-button',
        metadata: {},
      },
    }));

    await logger.waitFor('[WS] Invalid telemetry');
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects invalid JSON and remains available for valid telemetry', async () => {
    const socket = await connect();
    socket.send('{invalid json');
    await logger.waitFor('[WS] Invalid message: Invalid JSON');

    sendValidTelemetry(socket);
    await logger.waitFor('[WS] Received telemetry');
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('rejects unknown message types without closing the connection', async () => {
    const socket = await connect();
    socket.send(JSON.stringify({ type: 'not_supported', payload: {} }));
    await logger.waitFor('[WS] Invalid message: Unknown message type');

    sendValidTelemetry(socket);
    await logger.waitFor('[WS] Received telemetry');
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('logs a client connection', async () => {
    await connect();
    await logger.waitFor('[WS] Client connected');
    expect(logger.entries).toContain('[WS] Client connected');
  });

  it('logs when a client disconnects', async () => {
    const socket = await connect();
    const closed = once(socket, 'close');
    socket.close();
    await closed;

    await logger.waitFor('[WS] Client disconnected');
    expect(logger.entries).toContain('[WS] Client disconnected');
  });
});