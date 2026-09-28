import { useEffect, useRef, useState } from 'react';
import { DomTelemetryTracker } from './telemetry/domTracking.js';
import {
  TelemetryWebSocketClient,
  type ConnectionStatus,
} from './telemetry/websocketClient.js';
import { WS_URL } from './telemetry/config.js';
import { createAdaptationHandler } from './renderer/adaptationHandler.js';
import { StateManager } from './state/stateManager.js';
import { DynamicRenderer } from './renderer/DynamicRenderer.js';

export function AdaptiveForm() {
  const [generatedTree, setGeneratedTree] = useState<unknown>(null);
  const [isAdapting, setIsAdapting] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const client = new TelemetryWebSocketClient();
    const stateManager = new StateManager();
    const tracker = new DomTelemetryTracker(client);

    const handleAdaptation = createAdaptationHandler(stateManager, {
      onStarted: () => setIsAdapting(true),
      onResult: (tree) => {
        setIsAdapting(false);
        setGeneratedTree(tree);
      },
      onFailed: () => {
        // per contract: keep the current UI as it is
        setIsAdapting(false);
      },
    });

    client.onServerMessage(handleAdaptation);
    client.onStatusChange(setStatus);
    client.connect(WS_URL);

    const detachers: Array<() => void> = [];
    [nameRef, emailRef, phoneRef].forEach((ref) => {
      if (ref.current) detachers.push(tracker.attach(ref.current));
    });
    if (submitRef.current) {
      detachers.push(tracker.attachClickTracking(submitRef.current));
    }

    return () => {
      detachers.forEach((detach) => detach());
      client.close();
    };
  }, []);

  if (generatedTree) {
    return <DynamicRenderer tree={generatedTree} />;
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h2>AuraGen Demo Form</h2>

      {status !== 'connected' && (
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
          {status === 'connecting'
            ? 'Connecting...'
            : 'Live adaptation is offline. The form still works normally.'}
        </p>
      )}
      {isAdapting && <p>Adjusting the form for you...</p>}

      <div>
        <label htmlFor="name">Full name</label>
        <input ref={nameRef} id="name" name="name" type="text" required />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input ref={emailRef} id="email" name="email" type="email" required />
      </div>

      <div>
        <label htmlFor="phone">Phone number</label>
        <input
          ref={phoneRef}
          id="phone"
          name="phone"
          type="tel"
          pattern="[0-9]{10}"
          required
        />
      </div>

      <button ref={submitRef} id="submit-button" type="submit">
        Submit
      </button>
    </form>
  );
}