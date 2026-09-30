import { createSignal, type Signal } from './signals.js';

export type RawFieldMetrics = {
  time_spent_ms: number;
  error_count: number;
  focus_switches: number;
  repeated_clicks: number;
};

const HESITATION_THRESHOLD_MS = 8000;
const REPEATED_ERROR_THRESHOLD = 2;
const REPEATED_FOCUS_THRESHOLD = 3;
const REPEATED_CLICK_THRESHOLD = 3;

export function detectSignals(metrics: RawFieldMetrics): Signal[] {
  const signals: Signal[] = [];

  if (metrics.time_spent_ms >= HESITATION_THRESHOLD_MS) {
    signals.push(createSignal('long_hesitation', metrics.time_spent_ms));
  }

  if (metrics.error_count >= REPEATED_ERROR_THRESHOLD) {
    signals.push(createSignal('repeated_errors', metrics.error_count));
  }

  if (metrics.focus_switches >= REPEATED_FOCUS_THRESHOLD) {
    signals.push(createSignal('repeated_focus_switch', metrics.focus_switches));
  }

  if (metrics.repeated_clicks >= REPEATED_CLICK_THRESHOLD) {
    signals.push(createSignal('repeated_clicks', metrics.repeated_clicks));
  }

  return signals;
}

export function detectSignalNames(metrics: RawFieldMetrics): string[] {
  return detectSignals(metrics).map((signal) => signal.name);
}