import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import type {
  ImportDeclaration,
  CallExpression,
  NewExpression,
  Identifier,
  FunctionDeclaration,
  FunctionExpression,
  ArrowFunctionExpression,
  Node
} from "@babel/types";

import { parseCode } from "../parser/babelParser.js";
import { checkImports } from "../policies/imports.policy.js";
import { checkGlobals } from "../policies/globals.policy.js";
import {
  checkCalls,
  checkMemberExpressions
} from "../policies/calls.policy.js";
import type {
  ValidationResult,
  ValidationIssue
} from "../../shared/contracts/validation.js";

const traverse: typeof _traverse =
  typeof _traverse === "function"
    ? _traverse
    : (_traverse as any).default;

function returnsJSX(fn: { body: Node }): boolean {
  const body = fn.body;

  if (body.type === "JSXElement" || body.type === "JSXFragment") {
    return true;
  }

  if (body.type === "BlockStatement") {
    return body.body.some(
      (stmt) =>
        stmt.type === "ReturnStatement" &&
        stmt.argument != null &&
        (stmt.argument.type === "JSXElement" ||
          stmt.argument.type === "JSXFragment")
    );
  }

  return false;
}

function makeResult(
  valid: boolean,
  issues: ValidationIssue[]
): ValidationResult {
  return {
    valid,
    errors: issues.map((issue) => issue.message),
    warnings: [],
    issues
  };
}

export function validateGeneratedUI(source: string): ValidationResult {
  if (!source || source.trim().length === 0) {
    return makeResult(false, [
      {
        path: "source",
        message: "Empty source"
      }
    ]);
  }

  const parsed = parseCode(source);

  if (!parsed.success) {
    return makeResult(false, [
      {
        path: "syntax",
        message: "Invalid JavaScript/JSX syntax: " + parsed.error
      }
    ]);
  }

  const issues: ValidationIssue[] = [];
  const importNames: string[] = [];
  const globalNames: string[] = [];
  const callNames: string[] = [];
  const memberExpressions: Array<{
    object: string;
    property: string;
  }> = [];

  let hasComponentCandidate = false;

  traverse(parsed.ast, {
    ImportDeclaration(path: NodePath<ImportDeclaration>) {
      importNames.push(path.node.source.value);
    },

    ImportExpression() {
      issues.push({
        path: "call:import()",
        message: "Dynamic imports are not allowed."
      });
    },

    CallExpression(path: NodePath<CallExpression>) {
      const callee = path.node.callee;

      if (callee.type === "Import") {
        issues.push({
          path: "call:import()",
          message: "Dynamic imports are not allowed."
        });
      } else if (callee.type === "Identifier") {
        callNames.push(callee.name);
      }
    },

    MemberExpression(path) {
      const object = path.node.object;
      const property = path.node.property;

      if (
        object.type === "Identifier" &&
        property.type === "Identifier"
      ) {
        memberExpressions.push({
          object: object.name,
          property: property.name
        });
      }
    },

    NewExpression(path: NodePath<NewExpression>) {
      const callee = path.node.callee;

      if (callee.type === "Identifier") {
        callNames.push(callee.name);
      }
    },

    Identifier(path: NodePath<Identifier>) {
      if (path.key === "callee") {
        return;
      }

      globalNames.push(path.node.name);
    },

    FunctionDeclaration(path: NodePath<FunctionDeclaration>) {
      if (returnsJSX(path.node)) {
        hasComponentCandidate = true;
      }
    },

    FunctionExpression(path: NodePath<FunctionExpression>) {
      if (returnsJSX(path.node)) {
        hasComponentCandidate = true;
      }
    },

    ArrowFunctionExpression(path: NodePath<ArrowFunctionExpression>) {
      if (returnsJSX(path.node)) {
        hasComponentCandidate = true;
      }
    }
  });

  issues.push(...checkImports(importNames));
  issues.push(...checkCalls(callNames));
  issues.push(...checkMemberExpressions(memberExpressions));
  issues.push(...checkGlobals(globalNames));

  if (!hasComponentCandidate) {
    issues.push({
      path: "structure",
      message:
        "No function returning JSX was found — this does not look like a React component."
    });
  }

  return makeResult(issues.length === 0, issues);
}