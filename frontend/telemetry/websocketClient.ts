import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type {
  WebSocketMessage,
  ClientMessage,
  ServerMessage,
} from '../../shared/contracts/websocket.js';
import { TelemetryCollector } from './collector.js';

export function createTelemetryMessage(event: TelemetryEvent): ClientMessage {
  return { type: 'telemetry', payload: event };
}

type ServerMessageHandler = (message: ServerMessage) => void;

export class TelemetryWebSocketClient {
  private socket?: WebSocket;
  private readonly collector = new TelemetryCollector();
  private readonly messageHandlers: ServerMessageHandler[] = [];

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
    socket.addEventListener('message', (event) => this.handleIncoming(event));
  }

  private handleIncoming(event: MessageEvent): void {
    let parsed: WebSocketMessage;
    try {
      parsed = JSON.parse(event.data);
    } catch (err) {
      console.warn('[WS] Received malformed message, ignoring', err);
      return;
    }

    const knownTypes = ['redesign_started', 'redesign_result', 'redesign_failed'];
    if (!knownTypes.includes(parsed.type)) {
      console.warn('[WS] Unknown server message type, ignoring:', parsed.type);
      return;
    }

    const serverMessage = parsed as ServerMessage;
    this.messageHandlers.forEach((handler) => handler(serverMessage));
  }

  onServerMessage(handler: ServerMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  send(event: TelemetryEvent): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(createTelemetryMessage(event)));
    return true;
  }

  sendTestTelemetry(): boolean {
    const event = this.collector.collect('click', 'submit-button');
    return this.send(event);
  }

  close(): void {
    this.socket?.close();
  }
}