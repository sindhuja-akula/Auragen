import type { ValidationIssue } from "../../shared/contracts/validation.js";

export const ALLOWED_IMPORTS = ["react"];

export const FORBIDDEN_IMPORTS = [
  "fs",
  "child_process",
  "os",
  "path",
  "net",
  "http",
  "https",
  "process",
  "vm",
  "cluster",
  "dgram",
  "dns",
  "tls"
];

/**
 * Kept for backward compatibility with the original stub signature:
 * true only if every import is on the approved allowlist.
 */
export function validateImports(imports: string[]): boolean {
  return imports.every((name) => ALLOWED_IMPORTS.includes(name));
}

/**
 * Structured version used by the validator pipeline — reports *why* each
 * import failed (forbidden vs. simply unapproved) instead of a single bool.
 */
export function checkImports(imports: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const name of imports) {
    if (FORBIDDEN_IMPORTS.includes(name)) {
      issues.push({
        path: `import:${name}`,
        message: `Import "${name}" is not allowed.`
      });
    } else if (!ALLOWED_IMPORTS.includes(name)) {
      issues.push({
        path: `import:${name}`,
        message: `Import "${name}" is not in the approved allowlist.`
      });
    }
  }

  return issues;
}
