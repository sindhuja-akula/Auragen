import { useEffect, useRef, useState } from 'react';
import { DomTelemetryTracker } from './telemetry/domTracking.js';
import { TelemetryWebSocketClient } from './telemetry/websocketClient.js';
import { createAdaptationHandler } from './renderer/adaptationHandler.js';
import { StateManager } from './state/stateManager.js';
import { DynamicRenderer } from './renderer/DynamicRenderer.js';

// TODO: replace with the real orchestrator URL once Member 1 shares it
const ORCHESTRATOR_WS_URL = 'ws://localhost:8080';

export function AdaptiveForm() {
  const [generatedTree, setGeneratedTree] = useState<unknown>(null);
  const [isAdapting, setIsAdapting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

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
        setIsAdapting(false);
      },
    });

    client.onServerMessage(handleAdaptation);
    client.connect(ORCHESTRATOR_WS_URL);

    [nameRef, emailRef, phoneRef].forEach((ref) => {
      if (ref.current) tracker.attach(ref.current);
    });

    return () => client.close();
  }, []);

  if (generatedTree) {
    return <DynamicRenderer tree={generatedTree} />;
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h2>AuraGen Demo Form</h2>
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

      <button type="submit">Submit</button>
    </form>
  );
}