import { describe, it, expect, vi } from 'vitest';
import { createAdaptationHandler } from './adaptationHandler.js';
import { StateManager } from '../state/stateManager.js';
import type { ServerMessage } from '../../shared/contracts/websocket.js';

describe('createAdaptationHandler', () => {
  it('calls onStarted when redesign_started arrives', () => {
    const stateManager = new StateManager();
    const onStarted = vi.fn();
    const handle = createAdaptationHandler(stateManager, { onStarted });

    const message: ServerMessage = {
      type: 'redesign_started',
      payload: { sessionId: 'abc123' },
    };

    handle(message);
    expect(onStarted).toHaveBeenCalledWith({ sessionId: 'abc123' });
  });

  it('passes the generated UI tree to onResult on redesign_result', () => {
    const stateManager = new StateManager();
    const onResult = vi.fn();
    const handle = createAdaptationHandler(stateManager, { onResult });

    const sampleTree = {
      componentName: 'SimplifiedForm',
      children: [
        { type: 'Label', props: { text: 'Email' } },
        { type: 'Input', props: { name: 'email' } },
      ],
    };

    const message: ServerMessage = {
      type: 'redesign_result',
      payload: sampleTree,
    };

    handle(message);
    expect(onResult).toHaveBeenCalledWith(sampleTree);
  });

  it('does NOT call onResult when redesign_failed arrives (keeps current UI)', () => {
    const stateManager = new StateManager();
    const onResult = vi.fn();
    const onFailed = vi.fn();
    const handle = createAdaptationHandler(stateManager, { onResult, onFailed });

    const message: ServerMessage = {
      type: 'redesign_failed',
      payload: { reason: 'Forbidden network request detected' },
    };

    handle(message);
    expect(onResult).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith({ reason: 'Forbidden network request detected' });
  });

  it('ignores unknown message types without throwing', () => {
    const stateManager = new StateManager();
    const onResult = vi.fn();
    const handle = createAdaptationHandler(stateManager, { onResult });

    // @ts-expect-error - deliberately testing an invalid/unexpected type
    const message: ServerMessage = { type: 'something_else', payload: {} };

    expect(() => handle(message)).not.toThrow();
    expect(onResult).not.toHaveBeenCalled();
  });
});