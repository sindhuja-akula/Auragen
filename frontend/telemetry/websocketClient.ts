import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { WebSocketMessage } from '../../shared/contracts/websocket.js';
import { TelemetryCollector } from './collector.js';

export function createTelemetryMessage(event: TelemetryEvent): WebSocketMessage {
  return { type: 'telemetry', payload: event };
}

export class TelemetryWebSocketClient {
  private socket?: WebSocket;
  private readonly collector = new TelemetryCollector();

  connect(url: string): void {
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener('open', () => console.log('[WS] Connected'));
    socket.addEventListener('error', (event) => console.error('[WS] Connection error', event));
    socket.addEventListener('close', () => {
      console.log('[WS] Connection closed');
      if (this.socket === socket) {
        this.socket = undefined;
      }
    });
  }

  sendTestTelemetry(): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    const event = this.collector.collect('click', 'submit-button');
    this.socket.send(JSON.stringify(createTelemetryMessage(event)));
    return true;
  }

  close(): void {
    this.socket?.close();
  }
}