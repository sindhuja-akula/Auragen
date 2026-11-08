import { createServer, type Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer as WsServer, WebSocket, type RawData } from 'ws';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { ServerMessage } from '../../shared/contracts/websocket.js';
import { TelemetryPipeline } from '../orchestrator/telemetryPipeline.js';
import { isTelemetryEvent, parseClientMessage } from './messages.js';

export type WebSocketServerOptions = {
  host?: string;
  port?: number;
};

export type TelemetryHandler = (
  event: TelemetryEvent,
  send?: (message: ServerMessage) => void,
) => void | Promise<void>;

export class WebSocketServer {
  private httpServer?: HttpServer;
  private websocketServer?: WsServer;
  private readonly defaultPipeline: TelemetryPipeline;

  constructor(
    private readonly logger: Pick<Console, 'log' | 'error'> = console,
    private readonly onTelemetry?: TelemetryHandler,
  ) {
    this.defaultPipeline = new TelemetryPipeline();
  }

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
      socket.on('message', (data: RawData) => {
        void this.handleMessage(data, socket);
      });
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

        const url = `ws://${host}:${address.port}`;
        this.logger.log(`[WS] Listening at ${url}`);
        resolveAddress(url);
      });
      httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.error(`[WS] Port ${port} is already in use. Kill the existing process or use a different port.`);
          this.logger.error(`[WS] On Windows: netstat -ano | findstr :${port}   then  taskkill /PID <PID> /F`);
        }
        reject(err);
      });
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

  private async handleMessage(data: RawData, socket: WebSocket): Promise<void> {
    const parsed = parseClientMessage(data.toString());
    if (!parsed.ok) {
      this.logger.error(`[WS] Invalid message: ${parsed.reason}`);
      return;
    }

    const send = (message: ServerMessage): void => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    };

    if (parsed.message.type === 'redesign_request') {
      this.logger.log('[WS] Ignored unsupported message type: redesign_request');
      return;
    }

    if (!isTelemetryEvent(parsed.message.payload)) {
      this.logger.error('[WS] Invalid telemetry: required fields are missing or invalid');
      return;
    }

    const event = parsed.message.payload;
    this.logger.log('[WS] Received telemetry', event);
    try {
      await this.onTelemetry?.(event, send);
    } catch (error) {
      this.logger.error('[WS] Telemetry processing failed', error);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pipeline = new TelemetryPipeline();
  const server = new WebSocketServer(console, async (event, send) => {
    const result = await pipeline.process(event, (info) => {
      send?.({
        type: 'redesign_started',
        payload: { sessionId: info.sessionId, score: info.score },
      });
    });

    send?.({
      type: 'cognitive_score',
      payload: result.cognitiveScore,
    });

    if (result.adaptation.status === 'adaptation_complete') {
      console.log(`[WS] [9] SENDING redesign_result to frontend target="${result.adaptation.targetElementId}"`);
      send?.({
        type: 'redesign_result',
        payload: {
          componentName: result.adaptation.component,
          generatedUI: result.adaptation.generatedUI,
          targetElementId: result.adaptation.targetElementId,
          restoredState: result.adaptation.restoredState,
          latency: result.adaptation.latency,
        },
      });
      console.log(`[WS] [9] WEBSOCKET_MESSAGE_SENT type=redesign_result`);
    } else if (
      result.adaptation.status === 'adaptation_failed' ||
      result.adaptation.status === 'validation_failed'
    ) {
      if (result.cognitiveScore.score >= result.cognitiveScore.threshold) {
        send?.({
          type: 'redesign_failed',
          payload: {
            reason: result.adaptation.reason,
            targetElementId: result.adaptation.targetElementId,
            restoredState: result.adaptation.restoredState,
          },
        });
      }
    }
  });

  server.start({ host: '127.0.0.1' }).then((url) => {
    console.log(`[WS] Server ready at ${url}`);
    console.log(`[WS] ADAPTATION_DEBUG_MODE=${process.env.ADAPTATION_DEBUG_MODE === 'true' ? 'ON (Groq bypassed)' : 'OFF (Groq enabled)'}`);
  }).catch((error: unknown) => {
    console.error('[WS] Failed to start server', error);
    process.exitCode = 1;
  });
}
