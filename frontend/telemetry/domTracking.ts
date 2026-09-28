import { TelemetryCollector } from './collector.js';
import { telemetryEvents } from './events.js';
import { detectSignals } from './signalDetection.js';
import { getSessionId } from './session.js';
import type { TelemetryWebSocketClient } from './websocketClient.js';

type FieldTrackingState = {
  focusStart: number | null;
  timeSpentMs: number;
  errorCount: number;
  focusSwitches: number;
  emittedSignals: Set<string>;
};

// Signals found on the frontend are reported as observations only.
// Scoring and the decision to adapt happen in the backend (Member 1).
const SIGNAL_TO_EVENT: Record<string, string> = {
  long_hesitation: telemetryEvents.longHesitation,
  repeated_errors: telemetryEvents.failedAttempt,
  repeated_focus_switch: telemetryEvents.backtracking,
};

const REPEATED_CLICK_COUNT = 3;
const REPEATED_CLICK_WINDOW_MS = 2000;
// after one repeated_click is reported, stay quiet on that element for a while
const REPEATED_CLICK_COOLDOWN_MS = 5000;

export class DomTelemetryTracker {
  private readonly fieldState = new Map<string, FieldTrackingState>();
  private readonly clickTimes = new Map<string, number[]>();
  private readonly lastClickReport = new Map<string, number>();
  private readonly collector: TelemetryCollector;

  constructor(
    private readonly client: TelemetryWebSocketClient,
    sessionId: string = getSessionId(),
  ) {
    this.collector = new TelemetryCollector(sessionId);
  }

  private getOrInitState(elementId: string): FieldTrackingState {
    let state = this.fieldState.get(elementId);
    if (!state) {
      state = {
        focusStart: null,
        timeSpentMs: 0,
        errorCount: 0,
        focusSwitches: 0,
        emittedSignals: new Set(),
      };
      this.fieldState.set(elementId, state);
    }
    return state;
  }

  /** Track one form input. Returns a function that removes the listeners. */
  attach(input: HTMLInputElement): () => void {
    const elementId = input.id || input.name;
    const state = this.getOrInitState(elementId);

    const onFocus = () => {
      state.focusStart = Date.now();
      state.focusSwitches += 1;
    };

    const onBlur = () => {
      if (state.focusStart !== null) {
        state.timeSpentMs += Date.now() - state.focusStart;
        state.focusStart = null;
      }
      if (input.value.length > 0 && !input.checkValidity()) {
        state.errorCount += 1;
      }
      this.reportNewSignals(elementId, state);
    };

    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);

    return () => {
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', onBlur);
    };
  }

  /** Track repeated clicks on a button (e.g. submit). */
  attachClickTracking(button: HTMLElement): () => void {
    const elementId = button.id || 'unknown-button';

    const onClick = () => {
      const now = Date.now();
      const recent = (this.clickTimes.get(elementId) ?? []).filter(
        (time) => now - time <= REPEATED_CLICK_WINDOW_MS,
      );
      recent.push(now);
      this.clickTimes.set(elementId, recent);

      if (recent.length < REPEATED_CLICK_COUNT) return;

      // Already reported a burst on this element recently: stay quiet,
      // otherwise someone hammering the button floods the backend.
      const lastReport = this.lastClickReport.get(elementId) ?? 0;
      if (now - lastReport < REPEATED_CLICK_COOLDOWN_MS) return;

      const sent = this.emit(telemetryEvents.repeatedClick, elementId, {
        count: recent.length,
        window_ms: REPEATED_CLICK_WINDOW_MS,
      });

      if (sent) {
        this.lastClickReport.set(elementId, now);
        this.clickTimes.set(elementId, []);
      }
    };

    button.addEventListener('click', onClick);
    return () => button.removeEventListener('click', onClick);
  }

  private reportNewSignals(elementId: string, state: FieldTrackingState): void {
    const signals = detectSignals({
      time_spent_ms: state.timeSpentMs,
      error_count: state.errorCount,
      focus_switches: state.focusSwitches,
    });

    for (const signal of signals) {
      if (state.emittedSignals.has(signal.name)) continue;

      const eventType = SIGNAL_TO_EVENT[signal.name];
      if (!eventType) continue;

      const sent = this.emit(eventType, elementId, {
        value: signal.value,
        time_spent_ms: state.timeSpentMs,
        error_count: state.errorCount,
        focus_switches: state.focusSwitches,
      });

      // only mark as reported if it actually went out, so it can retry later
      if (sent) state.emittedSignals.add(signal.name);
    }
  }

  private emit(
    eventType: string,
    elementId: string,
    metadata: Record<string, unknown>,
  ): boolean {
    const event = this.collector.collect(eventType, elementId, metadata);
    const sent = this.client.send(event);
    if (!sent) {
      console.debug(`[Telemetry] not sent (socket not open): ${eventType} on ${elementId}`);
    }
    return sent;
  }

  getFieldState(elementId: string): FieldTrackingState | undefined {
    return this.fieldState.get(elementId);
  }
}