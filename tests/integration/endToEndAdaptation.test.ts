import { once } from 'node:events';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from '../../backend/websocket/server.js';
import { TelemetryPipeline } from '../../backend/orchestrator/telemetryPipeline.js';
import { Orchestrator } from '../../backend/orchestrator/orchestrator.js';
import { createTelemetryMessage } from '../../frontend/telemetry/websocketClient.js';
import { createAdaptationHandler } from '../../frontend/renderer/adaptationHandler.js';
import { StateManager } from '../../frontend/state/stateManager.js';
import { loadControlledComponent } from '../../frontend/renderer/componentLoader.js';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import type { ServerMessage } from '../../shared/contracts/websocket.js';

const VALID_SIMPLIFIED_UI = `
import React, { useState } from 'react';

function SimplifiedCheckout({ initialValues, onSubmit }) {
  const [name, setName] = useState(initialValues?.name || '');
  const [email, setEmail] = useState(initialValues?.email || '');

  return (
    <form className="simplified-checkout" onSubmit={onSubmit}>
      <h2>Quick One-Click Checkout</h2>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Complete</button>
    </form>
  );
}

export default SimplifiedCheckout;
`;

const UNSAFE_PAYLOAD_UI = `
import React from 'react';

function EvilForm() {
  eval("console.log('attack')");
  return <div>Evil</div>;
}

export default EvilForm;
`;

const MALFORMED_SYNTAX_UI = `
function Broken( {
  return <div>
`;

describe('End-to-End Self-Healing Generative UI Pipeline', () => {
  let server: WebSocketServer;
  let serverUrl: string;
  let clientSocket: WebSocket | undefined;

  afterEach(async () => {
    clientSocket?.close();
    clientSocket = undefined;
    await server?.stop();
  });

  it('completes the full happy path: telemetry -> scoring -> generation -> AST validation -> transport -> render & state preservation', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({
        code: VALID_SIMPLIFIED_UI,
        componentName: 'SimplifiedCheckout',
        dependencies: ['react'],
        metadata: { generationLatencyMs: 150 },
      } as GeneratedUI),
    };

    const orchestrator = new Orchestrator(0, mockGenerator);
    const pipeline = new TelemetryPipeline(orchestrator, { log: () => {} });

    server = new WebSocketServer(console, async (event, send) => {
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
        send?.({
          type: 'redesign_result',
          payload: {
            componentName: result.adaptation.component,
            generatedUI: result.adaptation.generatedUI,
            restoredState: result.adaptation.restoredState,
            latency: result.adaptation.latency,
          },
        });
      }
    });

    serverUrl = await server.start({ port: 0 });

    // 1. Browser connects
    clientSocket = new WebSocket(serverUrl);
    await once(clientSocket, 'open');

    const receivedMessages: ServerMessage[] = [];
    clientSocket.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // 2. User interacts and experiences friction (repeated clicks + hesitation to cross threshold 0.70)
    const initialUserState = { name: 'Sindhuja Akula', email: 'sindhuja@example.com' };

    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'e2e-session-1',
          timestamp: Date.now(),
          eventType: 'repeated_click',
          elementId: 'submit-button',
          metadata: {
            count: 3,
            formState: initialUserState,
          },
        })
      )
    );

    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'e2e-session-1',
          timestamp: Date.now() + 50,
          eventType: 'long_hesitation',
          elementId: 'submit-button',
          metadata: {
            delayMs: 8500,
            formState: initialUserState,
          },
        })
      )
    );

    // Wait for the backend pipeline to process
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Verify messages delivered to frontend
    const types = receivedMessages.map((m) => m.type);
    expect(types).toContain('redesign_started');
    expect(types).toContain('redesign_result');

    const resultMessage = receivedMessages.find((m) => m.type === 'redesign_result');
    expect(resultMessage).toBeDefined();

    const payload = resultMessage?.payload as any;
    expect(payload.componentName).toBe('SimplifiedCheckout');
    expect(payload.generatedUI).toBeDefined();
    expect(payload.generatedUI.code).toBe(VALID_SIMPLIFIED_UI);
    expect(payload.latency).toBeGreaterThanOrEqual(0);

    // 3. User State is preserved
    expect(payload.restoredState).toMatchObject(initialUserState);

    // 4. Controlled component loader instantiates without error
    const Component = loadControlledComponent(payload.generatedUI);
    expect(typeof Component).toBe('function');
  });

  it('preserves existing UI when generator fails', async () => {
    const mockGenerator = {
      generate: vi.fn().mockRejectedValue(new Error('Groq provider rate limit')),
    };

    const orchestrator = new Orchestrator(0, mockGenerator);
    const pipeline = new TelemetryPipeline(orchestrator, { log: () => {} });

    server = new WebSocketServer(console, async (event, send) => {
      const result = await pipeline.process(event, (info) => {
        send?.({
          type: 'redesign_started',
          payload: { sessionId: info.sessionId, score: info.score },
        });
      });

      if (
        result.adaptation.status === 'adaptation_failed' ||
        result.adaptation.status === 'validation_failed'
      ) {
        send?.({
          type: 'redesign_failed',
          payload: {
            reason: result.adaptation.reason,
            restoredState: result.adaptation.restoredState,
          },
        });
      }
    });

    serverUrl = await server.start({ port: 0 });

    clientSocket = new WebSocket(serverUrl);
    await once(clientSocket, 'open');

    const stateManager = new StateManager();
    const onResult = vi.fn();
    const onFailed = vi.fn();
    const handler = createAdaptationHandler(stateManager, { onResult, onFailed });

    clientSocket.on('message', (data) => {
      handler(JSON.parse(data.toString()));
    });

    // Send difficulty telemetry (repeated_click + long_hesitation)
    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'fail-session',
          timestamp: Date.now(),
          eventType: 'repeated_click',
          elementId: 'submit-button',
          metadata: { count: 3, formState: { name: 'Kept' } },
        })
      )
    );
    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'fail-session',
          timestamp: Date.now() + 50,
          eventType: 'long_hesitation',
          elementId: 'submit-button',
          metadata: { delayMs: 8500, formState: { name: 'Kept' } },
        })
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(onResult).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining('Groq provider rate limit'),
        restoredState: { name: 'Kept' },
      })
    );
  });

  it('rejects unsafe generated code (eval) via AST security gate and keeps current UI', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({
        code: UNSAFE_PAYLOAD_UI,
        componentName: 'EvilForm',
        dependencies: ['react'],
        metadata: {},
      } as GeneratedUI),
    };

    const orchestrator = new Orchestrator(0, mockGenerator);
    const pipeline = new TelemetryPipeline(orchestrator, { log: () => {} });

    server = new WebSocketServer(console, async (event, send) => {
      const result = await pipeline.process(event);
      if (result.adaptation.status === 'validation_failed') {
        send?.({
          type: 'redesign_failed',
          payload: {
            reason: result.adaptation.reason,
            restoredState: result.adaptation.restoredState,
          },
        });
      }
    });

    serverUrl = await server.start({ port: 0 });

    clientSocket = new WebSocket(serverUrl);
    await once(clientSocket, 'open');

    const onResult = vi.fn();
    const onFailed = vi.fn();
    const handler = createAdaptationHandler(new StateManager(), { onResult, onFailed });

    clientSocket.on('message', (data) => {
      handler(JSON.parse(data.toString()));
    });

    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'unsafe-session',
          timestamp: Date.now(),
          eventType: 'repeated_click',
          elementId: 'submit-button',
          metadata: { count: 3 },
        })
      )
    );
    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'unsafe-session',
          timestamp: Date.now() + 50,
          eventType: 'long_hesitation',
          elementId: 'submit-button',
          metadata: { delayMs: 8500 },
        })
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(onResult).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining('Call to "eval" is not allowed'),
      })
    );
  });

  it('rejects malformed syntax via AST parser and keeps current UI', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({
        code: MALFORMED_SYNTAX_UI,
        componentName: 'Broken',
        dependencies: ['react'],
        metadata: {},
      } as GeneratedUI),
    };

    const orchestrator = new Orchestrator(0, mockGenerator);
    const pipeline = new TelemetryPipeline(orchestrator, { log: () => {} });

    server = new WebSocketServer(console, async (event, send) => {
      const result = await pipeline.process(event);
      if (result.adaptation.status === 'validation_failed') {
        send?.({
          type: 'redesign_failed',
          payload: {
            reason: result.adaptation.reason,
            restoredState: result.adaptation.restoredState,
          },
        });
      }
    });

    serverUrl = await server.start({ port: 0 });

    clientSocket = new WebSocket(serverUrl);
    await once(clientSocket, 'open');

    const onResult = vi.fn();
    const onFailed = vi.fn();
    const handler = createAdaptationHandler(new StateManager(), { onResult, onFailed });

    clientSocket.on('message', (data) => {
      handler(JSON.parse(data.toString()));
    });

    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'malformed-session',
          timestamp: Date.now(),
          eventType: 'repeated_click',
          elementId: 'submit-button',
          metadata: { count: 3 },
        })
      )
    );
    clientSocket.send(
      JSON.stringify(
        createTelemetryMessage({
          sessionId: 'malformed-session',
          timestamp: Date.now() + 50,
          eventType: 'long_hesitation',
          elementId: 'submit-button',
          metadata: { delayMs: 8500 },
        })
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(onResult).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining('Invalid JavaScript/JSX syntax'),
      })
    );
  });
});
