import { createServer, type Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer as WsServer, type RawData } from 'ws';
import { isTelemetryEvent, parseClientMessage } from './messages.js';

export type WebSocketServerOptions = {
  host?: string;
  port?: number;
};

export class WebSocketServer {
  private httpServer?: HttpServer;
  private websocketServer?: WsServer;

  constructor(private readonly logger: Pick<Console, 'log' | 'error'> = console) {}

  start({ host = '127.0.0.1', port = 3001 }: WebSocketServerOptions = {}): Promise<string> {
    if (this.httpServer) {
      return Promise.reject(new Error('WebSocket server is already running'));
    }

    const httpServer = createServer();
    const websocketServer = new WsServer({ server: httpServer });
    this.httpServer = httpServer;
    this.websocketServer = websocketServer;

    websocketServer.on('connection', (socket) => {
      this.logger.log('[WS] Client connected');
      socket.on('message', (data: RawData) => this.handleMessage(data));
      socket.on('close', () => this.logger.log('[WS] Client disconnected'));
      socket.on('error', (error) => this.logger.error('[WS] Client error', error));
    });

    websocketServer.on('error', (error) => this.logger.error('[WS] Server error', error));
    httpServer.on('error', (error) => this.logger.error('[WS] Server error', error));

    return new Promise((resolveAddress, reject) => {
      httpServer.once('listening', () => {
        const address = httpServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Unable to determine WebSocket server address'));
          return;
        }

        resolveAddress(`ws://${host}:${address.port}`);
      });
      httpServer.once('error', reject);
      httpServer.listen(port, host);
    });
  }

  stop(): Promise<void> {
    const httpServer = this.httpServer;
    const websocketServer = this.websocketServer;
    if (!httpServer || !websocketServer) {
      return Promise.resolve();
    }

    this.httpServer = undefined;
    this.websocketServer = undefined;
    for (const client of websocketServer.clients) {
      client.close();
    }

    return new Promise((resolveClose, reject) => {
      websocketServer.close((websocketError) => {
        if (websocketError) {
          reject(websocketError);
          return;
        }
        httpServer.close((httpError) => (httpError ? reject(httpError) : resolveClose()));
      });
    });
  }

  private handleMessage(data: RawData): void {
    const parsed = parseClientMessage(data.toString());
    if (!parsed.ok) {
      this.logger.error(`[WS] Invalid message: ${parsed.reason}`);
      return;
    }

    if (parsed.message.type === 'redesign_request') {
      this.logger.log('[WS] Ignored unsupported message type: redesign_request');
      return;
    }

    if (!isTelemetryEvent(parsed.message.payload)) {
      this.logger.error('[WS] Invalid telemetry: required fields are missing or invalid');
      return;
    }

    this.logger.log('[WS] Received telemetry', parsed.message.payload);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = new WebSocketServer();
  server.start({ host: '127.0.0.1' }).then((url) => {
    console.log(`[WS] Listening at ${url}`);
  }).catch((error: unknown) => {
    console.error('[WS] Failed to start server', error);
    process.exitCode = 1;
  });
}
