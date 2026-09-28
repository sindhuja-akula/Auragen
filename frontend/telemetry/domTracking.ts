import { TelemetryCollector } from './collector.js';
import { telemetryEvents } from './events.js';
import { detectSignalNames } from './signalDetection.js';
import type { TelemetryWebSocketClient } from './websocketClient.js';

type FieldTrackingState = {
  focusStart: number | null;
  timeSpentMs: number;
  errorCount: number;
  focusSwitches: number;
  clickCount: number;
};

const CLICK_REPORT_COOLDOWN_MS = 1000;

export class DomTelemetryTracker {
  private readonly fieldState = new Map<string, FieldTrackingState>();
  private readonly lastClickReportAt = new Map<string, number>();
  private readonly collector: TelemetryCollector;

  constructor(
    private readonly client: TelemetryWebSocketClient,
    sessionId?: string,
  ) {
    this.collector = new TelemetryCollector(sessionId);
  }

  private getOrInitState(elementId: string): FieldTrackingState {
    let state = this.fieldState.get(elementId);
    if (!state) {
      state = { focusStart: null, timeSpentMs: 0, errorCount: 0, focusSwitches: 0, clickCount: 0 };
      this.fieldState.set(elementId, state);
    }
    return state;
  }

  attach(input: HTMLInputElement): void {
    const elementId = input.id || input.name;
    const state = this.getOrInitState(elementId);
    this.attachClick(input, elementId);

    input.addEventListener('focus', () => {
      state.focusStart = Date.now();
      state.focusSwitches += 1;
    });

    input.addEventListener('blur', () => {
      if (state.focusStart !== null) {
        state.timeSpentMs += Date.now() - state.focusStart;
        state.focusStart = null;
      }

      const isInvalid = !input.checkValidity() && input.value.length > 0;
      if (isInvalid) {
        state.errorCount += 1;
        this.emit(elementId, telemetryEvents.interaction, state, 'validation_error');
      }

      this.emit(elementId, telemetryEvents.interaction, state, 'field_blur');
    });
  }

  attachClick(element: HTMLElement, elementId = element.id || 'element'): void {
    const state = this.getOrInitState(elementId);
    element.addEventListener('click', () => {
      state.clickCount += 1;
      if (state.clickCount < 3) return;

      const now = Date.now();
      const lastReportAt = this.lastClickReportAt.get(elementId);
      if (lastReportAt !== undefined && now - lastReportAt < CLICK_REPORT_COOLDOWN_MS) return;

      this.lastClickReportAt.set(elementId, now);
      this.emit(elementId, telemetryEvents.interaction, state, 'repeated_click');
    });
  }

  private emit(
    elementId: string,
    eventType: string,
    state: FieldTrackingState,
    reason: string,
  ): void {
    const event = this.collector.collect(eventType, elementId, {
      time_spent_ms: state.timeSpentMs,
      error_count: state.errorCount,
      focus_switches: state.focusSwitches,
      repeated_clicks: state.clickCount,
      signals: detectSignalNames({
        time_spent_ms: state.timeSpentMs,
        error_count: state.errorCount,
        focus_switches: state.focusSwitches,
        repeated_clicks: state.clickCount,
      }),
      reason,
    });

    const sent = this.client.send(event);
    if (!sent) {
      console.warn(`Telemetry not sent (socket not open): ${elementId}/${eventType}`);
    }
  }

  getFieldState(elementId: string): FieldTrackingState | undefined {
    return this.fieldState.get(elementId);
  }
}