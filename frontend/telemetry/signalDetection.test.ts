import { describe, it, expect } from 'vitest';
import { detectSignals, detectSignalNames } from './signalDetection.js';

describe('detectSignals', () => {
  it('returns no signals for a field with no struggle', () => {
    const result = detectSignals({ time_spent_ms: 1000, error_count: 0, focus_switches: 1, repeated_clicks: 0 });
    expect(result).toEqual([]);
  });

  it('detects long_hesitation when time spent crosses the threshold', () => {
    const names = detectSignalNames({ time_spent_ms: 9000, error_count: 0, focus_switches: 1, repeated_clicks: 0 });
    expect(names).toContain('long_hesitation');
  });

  it('detects repeated_errors when error count crosses the threshold', () => {
    const names = detectSignalNames({ time_spent_ms: 1000, error_count: 2, focus_switches: 1, repeated_clicks: 0 });
    expect(names).toContain('repeated_errors');
  });

  it('detects repeated_focus_switch when focus switches cross the threshold', () => {
    const names = detectSignalNames({ time_spent_ms: 1000, error_count: 0, focus_switches: 3, repeated_clicks: 0 });
    expect(names).toContain('repeated_focus_switch');
  });

  it('can detect multiple signals at once', () => {
    const names = detectSignalNames({ time_spent_ms: 9000, error_count: 2, focus_switches: 3, repeated_clicks: 3 });
    expect(names).toHaveLength(4);
  });

  it('detects repeated clicks after the threshold', () => {
    const names = detectSignalNames({ time_spent_ms: 1000, error_count: 0, focus_switches: 0, repeated_clicks: 3 });
    expect(names).toContain('repeated_clicks');
  });
});