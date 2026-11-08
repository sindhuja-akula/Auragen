import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DomTelemetryTracker } from './telemetry/domTracking.js';
import {
  TelemetryWebSocketClient,
  type ConnectionStatus,
} from './telemetry/websocketClient.js';
import { WS_URL } from './telemetry/config.js';
import { createAdaptationHandler } from './renderer/adaptationHandler.js';
import { StateManager } from './state/stateManager.js';
import { DynamicRenderer } from './renderer/DynamicRenderer.js';
import type { GeneratedUI } from '../shared/contracts/generated-ui.js';

// Simple trace counter — increments per page session
let localTraceCounter = 0;
function nextLocalTrace(): string {
  return `fe-${String(++localTraceCounter).padStart(3, '0')}`;
}

export function AdaptiveForm() {
  const [formValues, setFormValues] = useState<Record<string, string>>({
    name: 'Sindhuja',
    email: 'sindhuja@example.com',
    phone: '',
    accountType: 'developer',
  });

  const [adaptedFields, setAdaptedFields] = useState<Record<string, GeneratedUI>>({});
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('disconnected');

  const lastActiveFieldRef = useRef<string>('phone');
  const clientRef = useRef<TelemetryWebSocketClient | null>(null);
  const stateManagerRef = useRef<StateManager>(new StateManager());
  const trackerRef = useRef<DomTelemetryTracker | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const accountTypeRef = useRef<HTMLSelectElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  // Keep formValues accessible in callbacks and StateManager
  const formValuesRef = useRef(formValues);
  useEffect(() => {
    formValuesRef.current = formValues;
    stateManagerRef.current.setState(formValues);
  }, [formValues]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    lastActiveFieldRef.current = name;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    if (name === 'email' && emailError) setEmailError(null);
    if (name === 'phone' && phoneError) setPhoneError(null);
    if (name === 'name' && nameError) setNameError(null);
  };

  const handleFieldStateChange = useCallback((updated: Record<string, unknown>) => {
    setFormValues((prev) => {
      const merged: Record<string, string> = { ...prev };
      for (const [key, val] of Object.entries(updated)) {
        if (typeof val === 'string') merged[key] = val;
      }
      return merged;
    });
  }, []);

  const emitTelemetry = useCallback(
    (eventType: string, elementId: string, metadata: Record<string, unknown> = {}) => {
      if (!clientRef.current) return;
      const sessionId =
        (clientRef.current as any).collector?.sessionId || 'session-demo';
      const event = {
        sessionId,
        timestamp: Date.now(),
        eventType,
        elementId,
        metadata: {
          ...metadata,
          targetElementId: elementId,
          formState: formValuesRef.current,
        },
      };
      console.log(`[ADAPTATION][pending] [1] TELEMETRY_EMIT eventType="${eventType}" elementId="${elementId}"`);
      clientRef.current.send(event);
    },
    [],
  );

  useEffect(() => {
    const client = new TelemetryWebSocketClient();
    clientRef.current = client;

    const stateManager = stateManagerRef.current;
    stateManager.setState(formValuesRef.current);

    const tracker = new DomTelemetryTracker(client, undefined, () => formValuesRef.current);
    trackerRef.current = tracker;

    const handleAdaptation = createAdaptationHandler(stateManager, {
      onStarted: (payload: any) => {
        const trace = nextLocalTrace();
        console.log(`[ADAPTATION][${trace}] [10] FRONTEND_RECEIVED type=redesign_started score=${payload?.score}`);
      },
      onResult: (payload: any) => {
        const trace = nextLocalTrace();
        console.log(`[ADAPTATION][${trace}] [10] FRONTEND_RECEIVED type=redesign_result payload=`, JSON.stringify({
          targetElementId: payload?.targetElementId,
          componentName: payload?.componentName,
          hasGeneratedUI: !!payload?.generatedUI,
          generatedUICodeLength: payload?.generatedUI?.code?.length ?? 0,
        }));

        const target: string = payload?.targetElementId || 'email';

        // State restoration
        if (payload?.restoredState && typeof payload.restoredState === 'object') {
          setFormValues((prev) => {
            const next = { ...prev };
            for (const [k, v] of Object.entries(payload.restoredState)) {
              if (typeof v === 'string') next[k] = v;
            }
            console.log(`[ADAPTATION][${trace}] [13] STATE_PRESERVED keys=${JSON.stringify(Object.keys(next))}`);
            return next;
          });
        }

        // Extract the GeneratedUI — it may be at payload.generatedUI or the payload itself may be the GeneratedUI
        const genUI: GeneratedUI | null =
          (payload?.generatedUI && typeof payload.generatedUI.code === 'string')
            ? payload.generatedUI
            : (payload?.code && typeof payload.code === 'string' ? payload : null);

        if (genUI) {
          console.log(`[ADAPTATION][${trace}] [11] REACT_STATE_UPDATE target="${target}" componentName="${genUI.componentName}" codeLength=${genUI.code.length}`);
          setAdaptedFields((prev) => ({
            ...prev,
            [target]: genUI,
          }));
          console.log(`[ADAPTATION][${trace}] [12] RENDER_TARGET_CHANGED target="${target}"`);
          console.log(`\n${'='.repeat(50)}`);
          console.log(`FINAL RESULT: ADAPTATION SUCCESS`);
          console.log(`${'='.repeat(50)}\n`);
        } else {
          console.error(`[ADAPTATION][${trace}] RENDER_FAILED — no valid GeneratedUI in payload:`, payload);
          console.log(`\n${'='.repeat(50)}`);
          console.log(`FINAL RESULT: ADAPTATION FAILED`);
          console.log(`FAILED AT: [12] RENDER — generatedUI missing from payload`);
          console.log(`${'='.repeat(50)}\n`);
        }
      },
      onFailed: (payload: any) => {
        const reason = payload?.reason || 'Unknown error';
        console.warn(`[ADAPTATION][pending] [10] FRONTEND_RECEIVED type=redesign_failed reason="${reason}". Keeping current UI.`);
      },
      onCognitiveScore: (payload: any) => {
        if (payload && typeof payload.score === 'number') {
          console.log(`[ADAPTATION][pending] [2] COGNITIVE_SCORE_RECEIVED score=${payload.score.toFixed(2)} threshold=${payload.threshold}`);
        }
      },
    });

    client.onServerMessage(handleAdaptation);
    client.onStatusChange((status: ConnectionStatus) => {
      setWsStatus(status);
      console.log(`[WS] status=${status}`);
    });
    client.connect(WS_URL);

    // Natural field interaction tracking
    const detachers: Array<() => void> = [];
    [nameRef, emailRef, phoneRef].forEach((ref) => {
      if (ref.current) detachers.push(tracker.attach(ref.current));
    });
    if (continueRef.current) {
      detachers.push(tracker.attachClickTracking(continueRef.current));
    }

    // Expose programmatic test helper in developer console
    (window as any).__auragen = {
      // Simulate user struggle on a specific field (triggers telemetry → scoring → adaptation)
      simulateStruggle: (target: string = 'email') => {
        console.log(`\n[__auragen.simulateStruggle] Simulating struggle on target: "${target}"`);
        console.log(`[__auragen.simulateStruggle] Emitting: repeated_click + long_hesitation + failed_attempt`);
        emitTelemetry('repeated_click', target, { count: 3 });
        setTimeout(() => {
          emitTelemetry('long_hesitation', target, { delayMs: 8500 });
        }, 100);
        setTimeout(() => {
          emitTelemetry('failed_attempt', target, { reason: 'invalid_format' });
        }, 200);
      },
      // Check current adapted fields
      getAdaptedFields: () => Object.keys(adaptedFields),
      // Check WS connection status
      wsStatus: () => client.getStatus(),
    };

    return () => {
      detachers.forEach((detach) => detach());
      client.close();
      delete (window as any).__auragen;
    };
  }, [emitTelemetry]);

  // Blur validation handlers for all fields
  const handleNameBlur = () => {
    lastActiveFieldRef.current = 'name';
    const val = formValues.name.trim();
    if (val.length < 2) {
      setNameError('Please enter a full name (at least 2 characters)');
      emitTelemetry('failed_attempt', 'name', {
        reason: 'too_short',
        attemptedValue: val,
      });
    } else {
      setNameError(null);
    }
  };

  const handleEmailBlur = () => {
    lastActiveFieldRef.current = 'email';
    const val = formValues.email.trim();
    if (!val || !val.includes('@') || !val.includes('.')) {
      setEmailError('Please enter a valid email address (e.g. name@example.com)');
      emitTelemetry('failed_attempt', 'email', {
        reason: 'invalid_format',
        attemptedValue: val,
      });
    } else {
      setEmailError(null);
    }
  };

  const handlePhoneBlur = () => {
    lastActiveFieldRef.current = 'phone';
    const val = formValues.phone.trim();
    const hasLetters = /[a-zA-Z]/.test(val);
    const digitCount = (val.match(/\d/g) || []).length;
    if (!val || hasLetters || digitCount < 7) {
      setPhoneError('Please enter a valid phone number (digits only, e.g. 555-123-4567)');
      emitTelemetry('failed_attempt', 'phone', {
        reason: hasLetters ? 'contains_letters' : 'insufficient_digits',
        attemptedValue: val,
      });
    } else {
      setPhoneError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nameVal = formValues.name.trim();
    const emailVal = formValues.email.trim();
    const phoneVal = formValues.phone.trim();

    const isNameInvalid = nameVal.length < 2;
    const isEmailInvalid = !emailVal || !emailVal.includes('@') || !emailVal.includes('.');
    const isPhoneInvalid = !phoneVal || /[a-zA-Z]/.test(phoneVal) || (phoneVal.match(/\d/g) || []).length < 7;

    // Check the field the user was most recently interacting with first!
    const target = lastActiveFieldRef.current;

    if (target === 'phone' && isPhoneInvalid) {
      setPhoneError('Please enter a valid phone number (digits only)');
      phoneRef.current?.focus();
      emitTelemetry('repeated_click', 'phone', { count: 2, action: 'submit_rejected' });
      setTimeout(() => {
        emitTelemetry('failed_attempt', 'phone', { reason: 'submit_with_invalid_phone' });
      }, 50);
      return;
    }

    if (target === 'email' && isEmailInvalid) {
      setEmailError('Please enter a valid email address');
      emailRef.current?.focus();
      emitTelemetry('repeated_click', 'email', { count: 2, action: 'submit_rejected' });
      setTimeout(() => {
        emitTelemetry('failed_attempt', 'email', { reason: 'submit_with_invalid_email' });
      }, 50);
      return;
    }

    if (target === 'name' && isNameInvalid) {
      setNameError('Please enter your full name');
      nameRef.current?.focus();
      emitTelemetry('repeated_click', 'name', { count: 2, action: 'submit_rejected' });
      setTimeout(() => {
        emitTelemetry('failed_attempt', 'name', { reason: 'submit_with_invalid_name' });
      }, 50);
      return;
    }

    // Secondary checks: focus whichever field is actually invalid, without default preference to email
    if (isPhoneInvalid) {
      setPhoneError('Please enter a valid phone number');
      phoneRef.current?.focus();
      emitTelemetry('repeated_click', 'phone', { count: 1 });
      return;
    }
    if (isEmailInvalid) {
      setEmailError('Please enter a valid email address');
      emailRef.current?.focus();
      emitTelemetry('repeated_click', 'email', { count: 1 });
      return;
    }
    if (isNameInvalid) {
      setNameError('Please enter your full name');
      nameRef.current?.focus();
      emitTelemetry('repeated_click', 'name', { count: 1 });
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="account-setup-container">
        <div className="account-setup-card">
          <div className="success-screen">
            <h2>Account Setup Complete</h2>
            <p>Welcome, {formValues.name}! Your account has been created.</p>
            <div className="summary-list">
              <div><strong>Email:</strong> {formValues.email}</div>
              <div><strong>Phone:</strong> {formValues.phone}</div>
              <div><strong>Account Type:</strong> {formValues.accountType}</div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setSubmitted(false)}
            >
              Back to Form
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-setup-container">
      <div className="account-setup-card">
        <div className="setup-header">
          <h1>Account Setup</h1>
          <p className="setup-subtitle">Complete your profile to get started.</p>
        </div>

        <form className="setup-form" onSubmit={handleSubmit}>
          {/* 1. Full Name — Targeted Adaptive Region */}
          <div className="form-group-region" id="field-group-name">
            {adaptedFields['name'] ? (
              <div className="adaptive-field-wrapper adapted">
                <div className="adaptation-badge">✦ Adapted Interaction</div>
                <DynamicRenderer
                  tree={adaptedFields['name']}
                  initialValues={formValues}
                  onStateChange={handleFieldStateChange}
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  ref={nameRef}
                  id="name"
                  name="name"
                  type="text"
                  value={formValues.name}
                  onChange={handleInputChange}
                  onFocus={() => { lastActiveFieldRef.current = 'name'; }}
                  onBlur={handleNameBlur}
                  placeholder="Full Name"
                  required
                />
                {nameError && <span className="field-error">{nameError}</span>}
              </div>
            )}
          </div>

          {/* 2. Email — Targeted Adaptive Region */}
          <div className="form-group-region" id="field-group-email">
            {adaptedFields['email'] ? (
              <div className="adaptive-field-wrapper adapted">
                <div className="adaptation-badge">✦ Adapted Interaction</div>
                <DynamicRenderer
                  tree={adaptedFields['email']}
                  initialValues={formValues}
                  onStateChange={handleFieldStateChange}
                  fallback={
                    <div className="form-group">
                      <label htmlFor="email">Email address</label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={formValues.email}
                        onChange={handleInputChange}
                        placeholder="e.g. name@example.com"
                        required
                      />
                      <span className="field-hint">Example: name@example.com</span>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  value={formValues.email}
                  onChange={handleInputChange}
                  onFocus={() => { lastActiveFieldRef.current = 'email'; }}
                  onBlur={handleEmailBlur}
                  placeholder="name@example.com"
                  required
                />
                {emailError && <span className="field-error">{emailError}</span>}
              </div>
            )}
          </div>

          {/* 3. Phone — Targeted Adaptive Region */}
          <div className="form-group-region" id="field-group-phone">
            {adaptedFields['phone'] ? (
              <div className="adaptive-field-wrapper adapted">
                <div className="adaptation-badge">✦ Adapted Interaction</div>
                <DynamicRenderer
                  tree={adaptedFields['phone']}
                  initialValues={formValues}
                  onStateChange={handleFieldStateChange}
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  ref={phoneRef}
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formValues.phone}
                  onChange={handleInputChange}
                  onFocus={() => { lastActiveFieldRef.current = 'phone'; }}
                  onBlur={handlePhoneBlur}
                  placeholder="Phone number (digits only)"
                  pattern="[0-9\+\-\s()]{7,15}"
                  required
                />
                {phoneError && <span className="field-error">{phoneError}</span>}
              </div>
            )}
          </div>

          {/* 4. Account Type — Targeted Adaptive Region */}
          <div className="form-group-region" id="field-group-accountType">
            {adaptedFields['accountType'] ? (
              <div className="adaptive-field-wrapper adapted">
                <div className="adaptation-badge">✦ Adapted Interaction</div>
                <DynamicRenderer
                  tree={adaptedFields['accountType']}
                  initialValues={formValues}
                  onStateChange={handleFieldStateChange}
                />
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="accountType">Account Type</label>
                <select
                  ref={accountTypeRef}
                  id="accountType"
                  name="accountType"
                  value={formValues.accountType}
                  onChange={handleInputChange}
                  onFocus={() => { lastActiveFieldRef.current = 'accountType'; }}
                >
                  <option value="student">Student</option>
                  <option value="developer">Developer</option>
                  <option value="business">Business</option>
                </select>
              </div>
            )}
          </div>

          {/* 5. Submit Button */}
          <div className="form-actions">
            <button
              ref={continueRef}
              id="continue-button"
              type="submit"
              className="btn-primary"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}