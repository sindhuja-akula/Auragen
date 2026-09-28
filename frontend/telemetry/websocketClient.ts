import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type {
  ClientMessage,
  ServerMessage,
  WebSocketMessage,
} from '../../shared/contracts/websocket.js';
import { TelemetryCollector } from './collector.js';
import { getSessionId } from './session.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type ServerMessageHandler = (message: ServerMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;

const SERVER_MESSAGE_TYPES = ['redesign_started', 'redesign_result', 'redesign_failed'];
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export function createTelemetryMessage(event: TelemetryEvent): ClientMessage {
  return { type: 'telemetry', payload: event };
}

export class TelemetryWebSocketClient {
  private socket?: WebSocket;
  private url?: string;
  private status: ConnectionStatus = 'disconnected';
  private closedByUser = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly collector = new TelemetryCollector(getSessionId());
  private readonly messageHandlers: ServerMessageHandler[] = [];
  private readonly statusHandlers: StatusHandler[] = [];

  connect(url: string): void {
    this.url = url;
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    if (!this.url) return;
    this.setStatus('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (err) {
      console.error('[WS] Could not create socket', err);
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
    });

    socket.addEventListener('message', (event) => this.handleIncoming(event));

    // an error is always followed by a close event, reconnect is handled there
    socket.addEventListener('error', () => {
      console.warn('[WS] Connection error');
    });

    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = undefined;
      }
      this.setStatus('disconnected');
      if (!this.closedByUser) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.open();
    }, delay);
  }

  private handleIncoming(event: MessageEvent): void {
    let parsed: WebSocketMessage;
    try {
      parsed = JSON.parse(event.data);
    } catch (err) {
      console.warn('[WS] Malformed message ignored', err);
      return;
    }

    if (!parsed || typeof parsed.type !== 'string' || !SERVER_MESSAGE_TYPES.includes(parsed.type)) {
      console.debug('[WS] Message type not handled by frontend, ignoring:', parsed?.type);
      return;
    }

    const message = parsed as ServerMessage;
    this.messageHandlers.forEach((handler) => handler(message));
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.statusHandlers.forEach((handler) => handler(next));
  }

  /** Called for redesign_started / redesign_result / redesign_failed. */
  onServerMessage(handler: ServerMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onStatusChange(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Returns false (instead of throwing) if the socket is not open. */
  send(event: TelemetryEvent): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(createTelemetryMessage(event)));
    return true;
  }

  /** Manual testing only, not used in the real flow. */
  sendTestTelemetry(): boolean {
    const event = this.collector.collect('click', 'submit-button');
    return this.send(event);
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}