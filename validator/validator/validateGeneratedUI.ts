import traverseImport from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type {
  CallExpression,
  Expression,
  JSXAttribute,
  JSXElement,
  MemberExpression,
  NewExpression,
} from "@babel/types";

import { parseCode } from "../parser/babelParser.js";
import {
  checkCalls,
  checkMemberExpressions,
} from "../policies/calls.policy.js";
import { checkGlobals } from "../policies/globals.policy.js";
import { checkImports } from "../policies/imports.policy.js";

import type {
  ValidationIssue,
  ValidationResult,
} from "../../shared/contracts/validation.js";

/**
 * Babel's traverse export can differ depending on ESM/CJS execution.
 * Normalize it once.
 */
const traverse: any =
  (traverseImport as any).default ?? (traverseImport as any);

type MemberRecord = {
  object: string;
  property: string;
  path?: string;
};

type StaticStringBindings = Map<string, string>;

/**
 * Determine whether an identifier was actually declared by the
 * generated source code.
 *
 * We intentionally use own lexical bindings rather than broad
 * scope.hasBinding() behavior.
 *
 * Example:
 *
 * const process = {};
 * process.value;
 *
 * `process` is local and should not be treated as Node's global
 * `process`.
 *
 * But:
 *
 * eval("...")
 *
 * has no local declaration and must still reach the security policy.
 */
function isLocalBinding(path: NodePath, name: string): boolean {
  let scope: any = path.scope;

  while (scope) {
    if (typeof scope.hasOwnBinding === "function") {
      if (scope.hasOwnBinding(name)) {
        return true;
      }
    } else if (scope.bindings && scope.bindings[name]) {
      /**
       * Defensive fallback for Babel versions where
       * hasOwnBinding() is unavailable at runtime.
       */
      return true;
    }

    scope = scope.parent;
  }

  return false;
}

/**
 * Resolve a statically-known string.
 *
 * Supported:
 *
 * "fetch"
 * `fetch`
 * const name = "fetch"; window[name]
 * "win" + "dow"
 */
function readStaticString(
  expression: Expression,
  bindings: StaticStringBindings,
): string | undefined {
  switch (expression.type) {
    case "StringLiteral":
      return expression.value;

    case "TemplateLiteral":
      if (expression.expressions.length === 0) {
        return expression.quasis[0]?.value.cooked ?? undefined;
      }

      return undefined;

    case "Identifier":
      return bindings.get(expression.name);

    case "BinaryExpression": {
      if (expression.operator !== "+") {
        return undefined;
      }

      const left = readStaticString(
        expression.left as Expression,
        bindings,
      );

      const right = readStaticString(
        expression.right as Expression,
        bindings,
      );

      if (left !== undefined && right !== undefined) {
        return left + right;
      }

      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Convert a member expression into a readable path.
 *
 * Examples:
 *
 * window.fetch
 * window["fetch"]
 * document.cookie
 * document["cookie"]
 */
function memberPathName(
  expression: Expression,
  bindings: StaticStringBindings,
): string | undefined {
  if (expression.type === "Identifier") {
    return expression.name;
  }

  if (expression.type === "TSNonNullExpression") {
    return memberPathName(
      expression.expression as Expression,
      bindings,
    );
  }

  if (expression.type !== "MemberExpression") {
    return undefined;
  }

  const objectName = memberPathName(
    expression.object as Expression,
    bindings,
  );

  if (!objectName) {
    return undefined;
  }

  let propertyName: string | undefined;

  if (expression.computed) {
    propertyName = readStaticString(
      expression.property as Expression,
      bindings,
    );
  } else if (expression.property.type === "Identifier") {
    propertyName = expression.property.name;
  }

  if (!propertyName) {
    return undefined;
  }

  return `${objectName}.${propertyName}`;
}

/**
 * Sensitive browser capability roots.
 *
 * Unknown computed properties on these roots are rejected.
 *
 * Example:
 *
 * window[userInput]()
 *
 * cannot be safely classified statically.
 */
function isSensitiveRoot(root: string): boolean {
  return new Set([
    "window",
    "globalThis",
    "document",
    "location",
    "navigator",
    "localStorage",
    "sessionStorage",
    "indexedDB",
  ]).has(root);
}

/**
 * Register a member expression for policy evaluation.
 */
function registerMember(
  members: MemberRecord[],
  object: string,
  property: string,
): void {
  members.push({
    object,
    property,
    path: `${object}.${property}`,
  });
}

/**
 * Determine whether a URL represents an external/network resource.
 */
function isDangerousRemoteURL(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("//") ||
    normalized.startsWith("data:")
  );
}

/**
 * Check network-capable JSX attributes.
 *
 * AuraGen generated UI is a controlled component, not an arbitrary
 * HTML document.
 */
function isDangerousJSXAttribute(
  elementName: string,
  jsxAttribute: JSXAttribute,
  bindings: StaticStringBindings,
): boolean {
  const attributeName =
    jsxAttribute.name.type === "JSXIdentifier"
      ? jsxAttribute.name.name
      : undefined;

  if (!attributeName) {
    return false;
  }

  const element = elementName.toLowerCase();
  const attribute = attributeName.toLowerCase();

  const networkAttribute =
    (["img", "video", "audio", "source", "track"].includes(element) &&
      attribute === "src") ||
    (element === "link" && attribute === "href") ||
    (element === "form" && attribute === "action");

  if (!networkAttribute) {
    return false;
  }

  if (!jsxAttribute.value) {
    return false;
  }

  /**
   * Example:
   *
   * <img src="https://example.com/image.png" />
   */
  if (jsxAttribute.value.type === "StringLiteral") {
    return isDangerousRemoteURL(jsxAttribute.value.value);
  }

  /**
   * Example:
   *
   * <img src={url} />
   *
   * If the value cannot be statically proven safe,
   * default-deny the network-capable capability.
   */
  if (jsxAttribute.value.type === "JSXExpressionContainer") {
    const expression = jsxAttribute.value.expression;

    if (
      expression.type === "StringLiteral" ||
      expression.type === "TemplateLiteral" ||
      expression.type === "Identifier" ||
      expression.type === "BinaryExpression"
    ) {
      const staticValue = readStaticString(
        expression as Expression,
        bindings,
      );

      if (staticValue !== undefined) {
        return isDangerousRemoteURL(staticValue);
      }
    }

    return true;
  }

  return false;
}

/**
 * JSX security validation.
 */
function checkJSXElement(
  path: NodePath<JSXElement>,
  issues: ValidationIssue[],
  bindings: StaticStringBindings,
): void {
  const opening = path.node.openingElement;

  if (opening.name.type !== "JSXIdentifier") {
    return;
  }

  const elementName = opening.name.name;
  const lowerName = elementName.toLowerCase();

  /**
   * Generated UI is a controlled component rather than an arbitrary
   * HTML document.
   */
  const forbiddenElements = new Set([
    "script",
    "iframe",
    "object",
    "embed",
  ]);

  if (forbiddenElements.has(lowerName)) {
    issues.push({
      path: `jsx:${elementName}`,
      message: `JSX element <${elementName}> is not allowed.`,
    });
  }

  for (const jsxAttribute of opening.attributes) {
    if (jsxAttribute.type !== "JSXAttribute") {
      continue;
    }

    const attributeName =
      jsxAttribute.name.type === "JSXIdentifier"
        ? jsxAttribute.name.name
        : undefined;

    /**
     * Explicit XSS-capable React API.
     */
    if (attributeName === "dangerouslySetInnerHTML") {
      issues.push({
        path: `jsx:${elementName}.${attributeName}`,
        message:
          "dangerouslySetInnerHTML is not allowed in generated UI.",
      });

      continue;
    }

    if (
      isDangerousJSXAttribute(
        elementName,
        jsxAttribute,
        bindings,
      )
    ) {
      issues.push({
        path: `jsx:${elementName}.${attributeName ?? "unknown"}`,
        message:
          `Network-capable JSX attribute "${attributeName ?? "unknown"}" is not allowed.`,
      });
    }
  }
}

/**
 * Main AuraGen AST/security validation boundary.
 *
 * Responsibilities:
 *
 * 1. Syntax validation
 * 2. AST traversal
 * 3. Import policy
 * 4. Dangerous call policy
 * 5. Dangerous global policy
 * 6. Member-expression policy
 * 7. Dangerous JSX policy
 * 8. Basic React component structure
 *
 * IMPORTANT:
 *
 * AST validation is static policy enforcement.
 * It is NOT a JavaScript sandbox.
 */
export function validateGeneratedUI(
  source: string,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  /**
   * ---------------------------------------------------------
   * 1. Empty source
   * ---------------------------------------------------------
   */
  if (!source || !source.trim()) {
    const issue: ValidationIssue = {
      path: "source",
      message: "Generated source code is empty.",
    };

    return {
      valid: false,
      errors: [issue.message],
      warnings: [],
      issues: [issue],
    };
  }

  /**
   * ---------------------------------------------------------
   * 2. Parse source
   * ---------------------------------------------------------
   */
const parseResult = parseCode(source);

if (!parseResult.success) {
  const issue: ValidationIssue = {
    path: "syntax",
    message: `Invalid JavaScript/JSX syntax: ${parseResult.error}`,
  };

  return {
    valid: false,
    errors: [issue.message],
    warnings: [],
    issues: [issue],
  };
}

const ast = parseResult.ast;

  /**
   * ---------------------------------------------------------
   * 3. Information collected from AST
   * ---------------------------------------------------------
   */
  const importNames: string[] = [];
  const globalNames: string[] = [];
  const callNames: string[] = [];
  const memberExpressions: MemberRecord[] = [];

  const stringBindings: StaticStringBindings = new Map();

  /**
   * We only need to know whether JSX exists inside a function.
   *
   * We do NOT recursively traverse function bodies.
   *
   * Babel already provides parent relationships.
   */
  let hasReactComponent = false;

  try {
    traverse(ast, {
      /**
       * -----------------------------------------------------
       * Static string bindings
       * -----------------------------------------------------
       */
      VariableDeclarator(path: NodePath<any>) {
        const id = path.node.id;
        const init = path.node.init;

        if (
          id?.type === "Identifier" &&
          init?.type === "StringLiteral"
        ) {
          stringBindings.set(id.name, init.value);
        }

        if (
          id?.type === "Identifier" &&
          init?.type === "TemplateLiteral" &&
          init.expressions.length === 0
        ) {
          const value = init.quasis[0]?.value.cooked;

          if (value !== undefined) {
            stringBindings.set(id.name, value);
          }
        }
      },

      /**
       * -----------------------------------------------------
       * Imports
       * -----------------------------------------------------
       */
      ImportDeclaration(path: NodePath<any>) {
        const sourceValue = path.node.source.value;

        if (typeof sourceValue === "string") {
          importNames.push(sourceValue);
        }
      },

      /**
       * -----------------------------------------------------
       * Dynamic imports
       * -----------------------------------------------------
       *
       * Babel/parser may represent import("x") as either:
       *
       * ImportExpression
       *
       * OR:
       *
       * CallExpression whose callee.type === "Import"
       */
      ImportExpression() {
        issues.push({
          path: "call:import()",
          message: "Dynamic imports are not allowed.",
        });
      },

      /**
       * -----------------------------------------------------
       * Call expressions
       * -----------------------------------------------------
       */
      CallExpression(path: NodePath<CallExpression>) {
        const callee = path.node.callee;

        /**
         * Dynamic import represented as:
         *
         * CallExpression {
         *   callee: {
         *     type: "Import"
         *   }
         * }
         */
        if (callee.type === "Import") {
          issues.push({
            path: "call:import()",
            message: "Dynamic imports are not allowed.",
          });

          return;
        }

        /**
         * Direct calls:
         *
         * eval()
         * Function()
         * require()
         * fetch()
         */
        if (callee.type === "Identifier") {
          /**
           * Only ignore identifiers that were actually declared
           * by generated code.
           */
          if (
            !isLocalBinding(path, callee.name) &&
            !callee.name.startsWith("_")
          ) {
            callNames.push(callee.name);
          }
        }

        /**
         * Member calls:
         *
         * window.fetch()
         * window["fetch"]()
         * navigator.sendBeacon()
         */
        if (callee.type === "MemberExpression") {
          const objectName = memberPathName(
            callee.object as Expression,
            stringBindings,
          );

          const propertyName = callee.computed
            ? readStaticString(
                callee.property as Expression,
                stringBindings,
              )
            : callee.property.type === "Identifier"
              ? callee.property.name
              : undefined;

          if (objectName && propertyName) {
            registerMember(
              memberExpressions,
              objectName,
              propertyName,
            );
          }
        }
      },

      /**
       * -----------------------------------------------------
       * Constructors
       * -----------------------------------------------------
       *
       * new Function()
       * new WebSocket()
       */
      NewExpression(path: NodePath<NewExpression>) {
        const callee = path.node.callee;

        if (callee.type === "Identifier") {
          if (!isLocalBinding(path, callee.name)) {
            callNames.push(callee.name);
          }
        }
      },

      /**
       * -----------------------------------------------------
       * Member expressions
       * -----------------------------------------------------
       */
      MemberExpression(path: NodePath<MemberExpression>) {
        const objectName = memberPathName(
          path.node.object as Expression,
          stringBindings,
        );

        const propertyName = path.node.computed
          ? readStaticString(
              path.node.property as Expression,
              stringBindings,
            )
          : path.node.property.type === "Identifier"
            ? path.node.property.name
            : undefined;

        /**
         * Unknown computed property on sensitive root:
         *
         * window[userInput]
         * document[userInput]
         *
         * Default-deny because the validator cannot prove what
         * capability is being accessed.
         */
        if (!objectName || !propertyName) {
          if (path.node.computed) {
            const root = memberPathName(
              path.node.object as Expression,
              stringBindings,
            );

            if (root && isSensitiveRoot(root)) {
              issues.push({
                path: `member:${root}.[computed]`,
                message:
                  `Dynamic computed access on "${root}" is not allowed.`,
              });
            }
          }

          return;
        }

        registerMember(
          memberExpressions,
          objectName,
          propertyName,
        );
      },

      /**
       * -----------------------------------------------------
       * JSX
       * -----------------------------------------------------
       */
      JSXElement(path: NodePath<JSXElement>) {
  checkJSXElement(
    path,
    issues,
    stringBindings,
  );

  /**
   * Determine whether this JSX element is contained inside
   * a function without performing another Babel traversal.
   *
   * We walk the already-existing parentPath chain.
   *
   * This is important because the validator performs exactly
   * one AST traversal. We do not need to recursively traverse
   * the JSX subtree or ask Babel to construct another traversal
   * context.
   */
  let currentPath: NodePath<any> | null = path.parentPath;

  while (currentPath) {
    if (currentPath.isFunction()) {
      hasReactComponent = true;
      break;
    }

    currentPath = currentPath.parentPath;
  }
},

      /**
       * -----------------------------------------------------
       * Global identifiers
       * -----------------------------------------------------
       */
      Identifier(path: NodePath<any>) {
        /**
         * Ignore property names:
         *
         * obj.process
         *
         * `process` is not a global reference here.
         */
        if (
          path.key === "callee" ||
          path.key === "property" ||
          path.parentPath?.node.type === "ImportSpecifier"
        ) {
          return;
        }

        if (!path.isReferencedIdentifier()) {
          return;
        }

        /**
         * Local variables, parameters and declarations should not
         * be classified as dangerous globals.
         */
        if (isLocalBinding(path, path.node.name)) {
          return;
        }

        globalNames.push(path.node.name);
      },
    });
  } catch (error) {
    /**
     * Generated code must never crash the application.
     *
     * Convert unexpected AST failures into structured validation
     * failure instead.
     */
    const message =
      error instanceof Error
        ? error.message
        : "Unknown AST traversal error.";

    const issue: ValidationIssue = {
      path: "ast",
      message: `AST validation failed: ${message}`,
    };

    return {
      valid: false,
      errors: [issue.message],
      warnings: [],
      issues: [issue],
    };
  }

  /**
   * ---------------------------------------------------------
   * 4. Apply security policies
   * ---------------------------------------------------------
   */
  issues.push(...checkImports(importNames));
  issues.push(...checkCalls(callNames));
  issues.push(
    ...checkMemberExpressions(memberExpressions),
  );
  issues.push(...checkGlobals(globalNames));

  /**
   * ---------------------------------------------------------
   * 5. Component structure
   * ---------------------------------------------------------
   */
  if (!hasReactComponent) {
    issues.push({
      path: "component",
      message:
        "Generated source does not contain a valid React component returning JSX.",
    });
  }

  /**
   * ---------------------------------------------------------
   * 6. Deduplicate issues
   * ---------------------------------------------------------
   */
  const uniqueIssues = Array.from(
    new Map(
      issues.map((issue) => [
        `${issue.path}:${issue.message}`,
        issue,
      ]),
    ).values(),
  );

  /**
   * ---------------------------------------------------------
   * 7. Final result
   * ---------------------------------------------------------
   */
  return {
    valid: uniqueIssues.length === 0,
    errors: uniqueIssues.map(
      (issue) => issue.message,
    ),
    warnings: [],
    issues: uniqueIssues,
  };
}