import type { ValidationIssue } from "../../shared/contracts/validation.js";

// Calls/constructions that allow arbitrary code execution.
export const FORBIDDEN_CALLS = ["eval", "Function", "require"];

// Network-capable APIs. Blocked by default; relax later if generated
// components need approved backend access.
export const FORBIDDEN_NETWORK_APIS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource"
];

/**
 * Kept for backward compatibility with the original stub signature:
 * true only if none of the named calls are forbidden.
 */
export function validateCalls(calls: string[]): boolean {
  return calls.every(
    (name) => !FORBIDDEN_CALLS.includes(name) && !FORBIDDEN_NETWORK_APIS.includes(name)
  );
}

export function checkCalls(calls: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const name of calls) {
    if (FORBIDDEN_CALLS.includes(name)) {
      issues.push({
        path: `call:${name}`,
        message: `Call to "${name}" is not allowed.`
      });
    } else if (FORBIDDEN_NETWORK_APIS.includes(name)) {
      issues.push({
        path: `call:${name}`,
        message: `Network call "${name}" is not allowed.`
      });
    }
  }

  return issues;
}
export function checkMemberExpressions(
  members: Array<{ object: string; property: string }>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const { object, property } of members) {
    // Block browser/network APIs
    if (
      (object === "window" && property === "fetch") ||
      (object === "window" && property === "WebSocket") ||
      (object === "navigator" && property === "sendBeacon")
    ) {
      issues.push({
        path: `member:${object}.${property}`,
        message: `Browser network API "${object}.${property}" is not allowed.`
      });
    }

    // Block sensitive browser state
    if (object === "document" && property === "cookie") {
      issues.push({
        path: `member:${object}.${property}`,
        message: `Access to "${object}.${property}" is not allowed.`
      });
    }

    if (
      (object === "localStorage" || object === "sessionStorage") &&
      property === "getItem"
    ) {
      issues.push({
        path: `member:${object}.${property}()`,
        message: `Access to "${object}.${property}()" is not allowed.`
      });
    }
  }

  return issues;
}
