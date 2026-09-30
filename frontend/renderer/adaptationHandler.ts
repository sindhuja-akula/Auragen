import type { ServerMessage } from '../../shared/contracts/websocket.js';
import { StateManager } from '../state/stateManager.js';

export type AdaptationCallbacks = {
  onStarted?: (payload: unknown) => void;
  onResult?: (tree: unknown) => void;
  onFailed?: (payload: unknown) => void;
};

export function createAdaptationHandler(
  stateManager: StateManager,
  callbacks: AdaptationCallbacks,
) {
  return function handle(message: ServerMessage): void {
    switch (message.type) {
      case 'redesign_started':
        callbacks.onStarted?.(message.payload);
        break;

      case 'redesign_result':
        callbacks.onResult?.(message.payload);
        break;

      case 'redesign_failed':
        console.warn('[Adaptation] redesign_failed, keeping current UI:', message.payload);
        callbacks.onFailed?.(message.payload);
        break;

      default:
        console.warn('[Adaptation] Unknown message type, ignoring:', message.type);
    }
  };
}

export { StateManager };