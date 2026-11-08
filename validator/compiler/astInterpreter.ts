import React from 'react';
import { parse } from '@babel/parser';

export const ALLOWED_TAGS = new Set([
  'form',
  'div',
  'section',
  'label',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'p',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
]);

export type ControlledComponentProps = {
  initialValues?: Record<string, unknown>;
  onStateChange?: (state: Record<string, unknown>) => void;
  onSubmit?: (data: Record<string, unknown>) => void;
};

/**
 * Evaluates a validated JSX AST into a safe React Functional Component without
 * using eval() or new Function().
 */
export function interpretJsxToComponent(
  sourceCode: string,
): React.ComponentType<ControlledComponentProps> {
  const ast = parse(sourceCode, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  let componentFn: any = null;
  for (const stmt of ast.program.body) {
    if (stmt.type === 'FunctionDeclaration') {
      componentFn = stmt;
      break;
    }
    if (
      stmt.type === 'ExportDefaultDeclaration' &&
      stmt.declaration.type === 'FunctionDeclaration'
    ) {
      componentFn = stmt.declaration;
      break;
    }
    if (stmt.type === 'VariableDeclaration') {
      const decl = stmt.declarations.find(
        (d: any) =>
          d.init &&
          (d.init.type === 'ArrowFunctionExpression' ||
            d.init.type === 'FunctionExpression'),
      );
      if (decl) {
        componentFn = decl.init;
        break;
      }
    }
  }

  if (!componentFn) {
    throw new Error('No component function found in AST');
  }

  const bodyStmts =
    componentFn.body.type === 'BlockStatement' ? componentFn.body.body : [];
  const returnStmt = bodyStmts.find((s: any) => s.type === 'ReturnStatement');
  if (!returnStmt || !returnStmt.argument) {
    throw new Error('No return statement found in component function');
  }

  const jsxRoot = returnStmt.argument;

  function evaluateExpression(expr: any, ctx: Record<string, any>): any {
    if (!expr) return undefined;
    if (
      expr.type === 'StringLiteral' ||
      expr.type === 'NumericLiteral' ||
      expr.type === 'BooleanLiteral'
    ) {
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
    if (expr.type === 'ObjectExpression') {
      const obj: Record<string, any> = {};
      for (const prop of expr.properties) {
        if (prop.type === 'ObjectProperty') {
          const key = prop.key.name || prop.key.value;
          obj[key] = evaluateExpression(prop.value, ctx);
        }
      }
      return obj;
    }
    if (expr.type === 'ArrayExpression') {
      return expr.elements.map((el: any) => evaluateExpression(el, ctx));
    }
    if (expr.type === 'ConditionalExpression') {
      const test = evaluateExpression(expr.test, ctx);
      return test ? evaluateExpression(expr.consequent, ctx) : evaluateExpression(expr.alternate, ctx);
    }
    if (expr.type === 'TemplateLiteral') {
      let str = '';
      for (let i = 0; i < expr.quasis.length; i++) {
        str += expr.quasis[i].value.raw;
        if (i < expr.expressions.length) {
          str += evaluateExpression(expr.expressions[i], ctx) ?? '';
        }
      }
      return str;
    }
    if (expr.type === 'CallExpression') {
      const callee = expr.callee;
      if (callee.type === 'MemberExpression') {
        const obj = evaluateExpression(callee.object, ctx);
        const methodName = callee.property.name || callee.property.value;
        if (Array.isArray(obj) && methodName === 'map') {
          const fn = expr.arguments[0];
          if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')) {
            const paramName = fn.params[0]?.name;
            return obj.map((item, index) => {
              const childCtx = { ...ctx, [paramName]: item, index };
              if (fn.body.type === 'JSXElement') {
                return renderNode(fn.body, childCtx, `map-${index}`);
              }
              if (fn.body.type === 'BlockStatement') {
                const ret = fn.body.body.find((s: any) => s.type === 'ReturnStatement');
                if (ret?.argument) {
                  return renderNode(ret.argument, childCtx, `map-${index}`);
                }
              }
              return evaluateExpression(fn.body, childCtx);
            });
          }
        }
      }
    }
    return undefined;
  }

  function renderNode(node: any, ctx: Record<string, any>, key: React.Key): React.ReactNode {
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
        throw new Error(`Tag <${tag}> is not in the allowed component list`);
      }

      const props: Record<string, any> = { key };
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
          props.onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
            ctx.updateField(fieldName, e.target.value);
          };
        }
      }

      if (tag === 'button') {
        const originalOnClick = props.onClick;
        props.onClick = (e: React.MouseEvent) => {
          if (e && e.preventDefault && props.type !== 'submit') e.preventDefault();
          if (typeof originalOnClick === 'function') {
            originalOnClick(e);
          }
          if (props.value) {
            const val = String(props.value);
            if (val.startsWith('@')) {
              // One-click domain shortcut chip e.g. @gmail.com
              const curr = String(ctx.formState['email'] || '').split('@')[0];
              const nextEmail = (curr.trim() ? curr.trim() : 'user') + val;
              ctx.updateField('email', nextEmail);
            } else if (val.startsWith('+')) {
              // Country code shortcut chip e.g. +1 or +91
              const raw = String(ctx.formState['phone'] || '').replace(/^\+\d+\s*/, '').trim();
              const nextPhone = val + ' ' + raw;
              ctx.updateField('phone', nextPhone);
            } else {
              ctx.updateField('accountType', val);
              ctx.updateField('tier', val);
            }
          }
        };
      }

      if (tag === 'form') {
        props.onSubmit = (e: React.FormEvent) => {
          if (e && e.preventDefault) e.preventDefault();
          ctx.onSubmit?.(ctx.formState);
        };
      }

      const children = (node.children || [])
        .map((child: any, idx: number) => renderNode(child, ctx, idx))
        .flat(Infinity)
        .filter((c: any) => c !== null && c !== undefined);

      return React.createElement(tag, props, ...children);
    }
    return null;
  }

  return function SafeAdaptedComponent(props: ControlledComponentProps) {
    const [formState, setFormState] = React.useState<Record<string, unknown>>(() => ({
      ...(props.initialValues || {}),
    }));

    React.useEffect(() => {
      if (props.initialValues) {
        setFormState((prev) => ({ ...prev, ...props.initialValues }));
      }
    }, [props.initialValues]);

    const updateField = (name: string, val: unknown) => {
      setFormState((prev) => {
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
