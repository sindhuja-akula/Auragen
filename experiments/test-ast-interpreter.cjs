const { parse } = require('@babel/parser');
const React = require('react');

const VALID_SIMPLIFIED_UI = `
import React, { useState } from 'react';

function SimplifiedCheckout({ initialValues, onSubmit }) {
  const [name, setName] = useState(initialValues?.name || '');
  const [email, setEmail] = useState(initialValues?.email || '');

  return (
    <form className="simplified-checkout" onSubmit={onSubmit}>
      <h2>Quick One-Click Checkout</h2>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Complete</button>
    </form>
  );
}

export default SimplifiedCheckout;
`;

const ALLOWED_TAGS = new Set([
  'form', 'div', 'section', 'label', 'input', 'button', 'select',
  'option', 'textarea', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'header', 'footer', 'main', 'aside', 'nav'
]);

function createAstInterpreter(sourceCode) {
  const ast = parse(sourceCode, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  let componentFn = null;
  for (const stmt of ast.program.body) {
    if (stmt.type === 'FunctionDeclaration') {
      componentFn = stmt;
      break;
    }
    if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration.type === 'FunctionDeclaration') {
      componentFn = stmt.declaration;
      break;
    }
    if (stmt.type === 'VariableDeclaration') {
      const decl = stmt.declarations.find(d => d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression'));
      if (decl) {
        componentFn = decl.init;
        break;
      }
    }
  }

  if (!componentFn) {
    throw new Error('No component function found in AST');
  }

  const bodyStmts = componentFn.body.type === 'BlockStatement' ? componentFn.body.body : [];
  const returnStmt = bodyStmts.find(s => s.type === 'ReturnStatement');
  if (!returnStmt || !returnStmt.argument) {
    throw new Error('No return statement found in component function');
  }

  const jsxRoot = returnStmt.argument;

  function evaluateExpression(expr, ctx) {
    if (!expr) return undefined;
    if (expr.type === 'StringLiteral' || expr.type === 'NumericLiteral' || expr.type === 'BooleanLiteral') {
      return expr.value;
    }
    if (expr.type === 'Identifier') {
      return ctx[expr.name];
    }
    if (expr.type === 'MemberExpression') {
      const obj = evaluateExpression(expr.object, ctx);
      const prop = expr.property.name || evaluateExpression(expr.property, ctx);
      return obj ? obj[prop] : undefined;
    }
    if (expr.type === 'OptionalMemberExpression') {
      const obj = evaluateExpression(expr.object, ctx);
      const prop = expr.property.name;
      return obj ? obj[prop] : undefined;
    }
    if (expr.type === 'LogicalExpression') {
      const left = evaluateExpression(expr.left, ctx);
      if (expr.operator === '||') return left || evaluateExpression(expr.right, ctx);
      if (expr.operator === '&&') return left && evaluateExpression(expr.right, ctx);
      if (expr.operator === '??') return left ?? evaluateExpression(expr.right, ctx);
    }
    return undefined;
  }

  function renderNode(node, ctx, key) {
    if (!node) return null;
    if (node.type === 'JSXText') {
      const val = node.value;
      if (!val.trim() && val.includes('\n')) return null;
      return val;
    }
    if (node.type === 'JSXExpressionContainer') {
      return evaluateExpression(node.expression, ctx);
    }
    if (node.type === 'JSXElement') {
      const tag = node.openingElement.name.name.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        throw new Error('Tag <' + tag + '> is not in the allowed component list');
      }

      const props = { key };
      for (const attr of node.openingElement.attributes) {
        if (attr.type === 'JSXAttribute') {
          const propName = attr.name.name === 'class' ? 'className' : attr.name.name;
          if (!attr.value) {
            props[propName] = true;
          } else if (attr.value.type === 'StringLiteral') {
            props[propName] = attr.value.value;
          } else if (attr.value.type === 'JSXExpressionContainer') {
            props[propName] = evaluateExpression(attr.value.expression, ctx);
          }
        }
      }

      const fieldName = props.name || props.id;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (fieldName && typeof ctx.formState === 'object') {
          props.value = ctx.formState[fieldName] ?? props.defaultValue ?? '';
          props.onChange = (e) => {
            ctx.updateField(fieldName, e.target.value);
          };
        }
      }

      if (tag === 'form') {
        props.onSubmit = (e) => {
          if (e && e.preventDefault) e.preventDefault();
          ctx.onSubmit?.(ctx.formState);
        };
      }

      const children = (node.children || [])
        .map((child, idx) => renderNode(child, ctx, idx))
        .filter(c => c !== null && c !== undefined);

      return React.createElement(tag, props, ...children);
    }
    return null;
  }

  return function SafeAdaptedComponent(props) {
    const [formState, setFormState] = React.useState(() => ({ ...(props.initialValues || {}) }));

    const updateField = (name, val) => {
      setFormState(prev => {
        const next = { ...prev, [name]: val };
        props.onStateChange?.(next);
        return next;
      });
    };

    const ctx = {
      initialValues: props.initialValues || {},
      formState,
      updateField,
      onSubmit: props.onSubmit,
      ...formState,
    };

    return renderNode(jsxRoot, ctx, 'root');
  };
}

const Component = createAstInterpreter(VALID_SIMPLIFIED_UI);
console.log('Component created successfully:', typeof Component);

// Test rendering
const element = React.createElement(Component, { initialValues: { name: 'Alice', email: 'alice@example.com' } });
console.log('Element created:', React.isValidElement(element));

const { renderToString } = require('react-dom/server');
console.log('Rendered HTML:\n', renderToString(element));
