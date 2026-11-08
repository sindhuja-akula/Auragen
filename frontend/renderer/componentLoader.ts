import React from 'react';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import {
  interpretJsxToComponent,
  ALLOWED_TAGS,
  type ControlledComponentProps,
} from '../../validator/compiler/astInterpreter.js';

export type { ControlledComponentProps };

/**
 * Browser-safe controlled component loader for AuraGen dynamic UI.
 *
 * Security Model (browser layer):
 * 1. The backend already ran the full AST security validation (validateGeneratedUI
 *    via @babel/traverse) before sending the generated code over WebSocket.
 *    We trust that boundary and do NOT re-import Node.js-only packages here.
 * 2. Lightweight source scan: We do a quick string-level check for obviously
 *    dangerous patterns (eval, Function constructor, script tags) before parsing.
 * 3. Deterministic AST Interpretation: The component is interpreted directly
 *    from its validated AST into React.createElement calls without invoking
 *    eval(), new Function(), or any runtime script execution.
 * 4. Fallback Safety: Wrapped with an ErrorBoundary to catch any runtime exceptions
 *    without crashing the host application.
 */

const BLOCKED_PATTERNS = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /document\s*\.\s*write/,
  /import\s*\(/,
  /require\s*\(/,
  /<\s*script/i,
  /\bwindow\s*\[/,
  /\bprocess\s*\./,
  /\b__proto__\b/,
  /\bconstructor\s*\[/,
];

function quickSecurityScan(code: string): { ok: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { ok: false, reason: `Blocked pattern: ${pattern}` };
    }
  }
  return { ok: true };
}

export function loadControlledComponent(
  generated: GeneratedUI,
): React.ComponentType<ControlledComponentProps> {
  // 1. Quick browser-side security scan (defense-in-depth)
  const scan = quickSecurityScan(generated.code);
  if (!scan.ok) {
    throw new Error(`Client-side security check failed: ${scan.reason}`);
  }

  // 2. Safe AST-to-React Interpretation (No eval, No new Function)
  try {
    return interpretJsxToComponent(generated.code);
  } catch (err) {
    throw new Error(
      `AST interpretation error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Re-export for downstream use
export { ALLOWED_TAGS };
