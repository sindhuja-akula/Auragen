import type { ValidationIssue } from "../../shared/contracts/validation.js";

export const FORBIDDEN_GLOBALS = [
  "eval",
  "Function",
  "globalThis",
  "require",
  "process",
  "__dirname",
  "__filename"
];

/**
 * Kept for backward compatibility with the original stub signature:
 * true only if none of the referenced globals are forbidden.
 */
export function validateGlobals(globals: string[]): boolean {
  return globals.every((name) => !FORBIDDEN_GLOBALS.includes(name));
}

export function checkGlobals(globals: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const name of globals) {
    if (FORBIDDEN_GLOBALS.includes(name)) {
      issues.push({
        path: `global:${name}`,
        message: `Reference to "${name}" is not allowed.`
      });
    }
  }

  return issues;
}
