import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { ClientMessage, ServerMessage, WebSocketMessage } from '../../shared/contracts/websocket.js';
import { TelemetryCollector } from './collector.js';

export function createTelemetryMessage(event: TelemetryEvent): ClientMessage {
  return { type: 'telemetry', payload: event };
}

type ServerMessageHandler = (message: ServerMessage) => void;

export class TelemetryWebSocketClient {
  private socket?: WebSocket;
  private readonly collector = new TelemetryCollector();
  private readonly messageHandlers: ServerMessageHandler[] = [];
  private readonly connectionHandlers: Array<(connected: boolean) => void> = [];
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private url?: string;
  private shouldReconnect = false;

  connect(url: string): void {
    this.url = url;
    this.shouldReconnect = true;
    this.openSocket();
  }

  private openSocket(): void {
    if (!this.url || !this.shouldReconnect) return;

    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket === socket) this.notifyConnectionChange(true);
      console.log('[WS] Connected');
    });
    socket.addEventListener('error', (event) => console.error('[WS] Connection error', event));
    socket.addEventListener('close', () => {
      console.log('[WS] Connection closed');
      if (this.socket === socket) {
        this.socket = undefined;
        this.notifyConnectionChange(false);
        this.scheduleReconnect();
      }
    });
    socket.addEventListener('message', (event) => this.handleIncoming(event));
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, 1000);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionHandlers.forEach((handler) => handler(connected));
  }

  onConnectionChange(handler: (connected: boolean) => void): void {
    this.connectionHandlers.push(handler);
    handler(this.socket?.readyState === WebSocket.OPEN);
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
    this.shouldReconnect = false;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.notifyConnectionChange(false);
  }
}