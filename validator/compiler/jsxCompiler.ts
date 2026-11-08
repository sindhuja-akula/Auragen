import { parseCode } from '../parser/babelParser.js';
import traverseImport from '@babel/traverse';
import * as t from '@babel/types';
import generateImport from '@babel/generator';

const traverse: any = (traverseImport as any).default ?? traverseImport;
const generate: any = (generateImport as any).default ?? generateImport;

/**
 * Transforms JSX syntax in validated source code into pure React.createElement calls.
 * Strips ES module imports/exports so the code can be executed in a controlled closure.
 */
export function compileJsxToExecutable(source: string, componentName?: string): {
  executableJs: string;
  detectedComponentName: string;
} {
  const parseResult = parseCode(source);
  if (!parseResult.success) {
    throw new Error(`Parse error during compilation: ${parseResult.error}`);
  }

  const ast = parseResult.ast;
  let detectedName = componentName ?? '';

  function convertJSXAttributeValue(value: t.JSXAttribute['value']): t.Expression {
    if (!value) return t.booleanLiteral(true);
    if (t.isStringLiteral(value)) return value;
    if (t.isJSXExpressionContainer(value)) {
      if (t.isJSXEmptyExpression(value.expression)) return t.nullLiteral();
      return value.expression as t.Expression;
    }
    if (t.isJSXElement(value)) return convertJSXElement(value);
    if (t.isJSXFragment(value)) return convertJSXFragment(value);
    return t.nullLiteral();
  }

  function convertJSXElement(node: t.JSXElement): t.CallExpression {
    const opening = node.openingElement;
    let tagExpr: t.Expression;

    if (t.isJSXIdentifier(opening.name)) {
      const name = opening.name.name;
      // HTML primitives start with lowercase; custom components start with uppercase
      if (/^[a-z]/.test(name)) {
        tagExpr = t.stringLiteral(name);
      } else {
        tagExpr = t.identifier(name);
      }
    } else if (t.isJSXMemberExpression(opening.name)) {
      const objName = t.isJSXIdentifier(opening.name.object) ? opening.name.object.name : 'React';
      const propName = opening.name.property.name;
      tagExpr = t.memberExpression(t.identifier(objName), t.identifier(propName));
    } else {
      tagExpr = t.stringLiteral('div');
    }

    // Attributes / Props
    const propsProps: (t.ObjectProperty | t.SpreadElement)[] = [];
    for (const attr of opening.attributes) {
      if (t.isJSXAttribute(attr)) {
        const attrName = t.isJSXIdentifier(attr.name)
          ? attr.name.name
          : typeof attr.name === 'object' && 'name' in attr.name
            ? String((attr.name as any).name)
            : 'attr';
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(attrName)
          ? t.identifier(attrName)
          : t.stringLiteral(attrName);
        const val = convertJSXAttributeValue(attr.value);
        propsProps.push(t.objectProperty(key, val));
      } else if (t.isJSXSpreadAttribute(attr)) {
        propsProps.push(t.spreadElement(attr.argument as t.Expression));
      }
    }

    const propsExpr: t.Expression = propsProps.length > 0
      ? t.objectExpression(propsProps)
      : t.nullLiteral();

    // Children
    const childrenExprs: t.Expression[] = [];
    for (const child of node.children) {
      if (t.isJSXText(child)) {
        const raw = child.value;
        // Normalize whitespace for text nodes
        const normalized = raw.replace(/\r\n|\r|\n/g, ' ');
        if (normalized.trim().length > 0) {
          childrenExprs.push(t.stringLiteral(normalized));
        }
      } else if (t.isJSXExpressionContainer(child)) {
        if (!t.isJSXEmptyExpression(child.expression)) {
          childrenExprs.push(child.expression as t.Expression);
        }
      } else if (t.isJSXElement(child)) {
        childrenExprs.push(convertJSXElement(child));
      } else if (t.isJSXFragment(child)) {
        childrenExprs.push(convertJSXFragment(child));
      }
    }

    return t.callExpression(
      t.memberExpression(t.identifier('React'), t.identifier('createElement')),
      [tagExpr, propsExpr, ...childrenExprs]
    );
  }

  function convertJSXFragment(node: t.JSXFragment): t.CallExpression {
    const childrenExprs: t.Expression[] = [];
    for (const child of node.children) {
      if (t.isJSXText(child)) {
        const normalized = child.value.replace(/\r\n|\r|\n/g, ' ');
        if (normalized.trim().length > 0) {
          childrenExprs.push(t.stringLiteral(normalized));
        }
      } else if (t.isJSXExpressionContainer(child)) {
        if (!t.isJSXEmptyExpression(child.expression)) {
          childrenExprs.push(child.expression as t.Expression);
        }
      } else if (t.isJSXElement(child)) {
        childrenExprs.push(convertJSXElement(child));
      }
    }
    return t.callExpression(
      t.memberExpression(t.identifier('React'), t.identifier('createElement')),
      [
        t.memberExpression(t.identifier('React'), t.identifier('Fragment')),
        t.nullLiteral(),
        ...childrenExprs,
      ]
    );
  }

  // Traverse and transform nodes
  traverse(ast, {
    // Detect component name from function declaration or variable declaration
    FunctionDeclaration(path: any) {
      if (!detectedName && path.node.id?.name) {
        detectedName = path.node.id.name;
      }
    },
    VariableDeclarator(path: any) {
      if (!detectedName && path.node.id?.type === 'Identifier') {
        const init = path.node.init;
        if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
          detectedName = path.node.id.name;
        }
      }
    },
    // Strip import declarations (imports are bound by the sandbox closure)
    ImportDeclaration(path: any) {
      path.remove();
    },
    // Convert export default ComponentName to defaultExport = ComponentName
    ExportDefaultDeclaration(path: any) {
      const decl = path.node.declaration;
      if (decl.type === 'Identifier') {
        detectedName = detectedName || decl.name;
        path.replaceWith(
          t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier('defaultExport'), decl),
          ])
        );
      } else if (decl.type === 'FunctionDeclaration') {
        if (decl.id) {
          detectedName = detectedName || decl.id.name;
          path.replaceWithMultiple([
            decl,
            t.variableDeclaration('const', [
              t.variableDeclarator(t.identifier('defaultExport'), decl.id),
            ]),
          ]);
        } else {
          path.replaceWith(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('defaultExport'),
                t.functionExpression(null, decl.params, decl.body, decl.generator, decl.async)
              ),
            ])
          );
        }
      } else {
        path.replaceWith(
          t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier('defaultExport'), decl as t.Expression),
          ])
        );
      }
    },
    ExportNamedDeclaration(path: any) {
      if (path.node.declaration) {
        path.replaceWith(path.node.declaration);
      } else {
        path.remove();
      }
    },
    JSXElement(path: any) {
      path.replaceWith(convertJSXElement(path.node));
    },
    JSXFragment(path: any) {
      path.replaceWith(convertJSXFragment(path.node));
    },
  });

  const output = generate(ast, { comments: false });
  return {
    executableJs: output.code,
    detectedComponentName: detectedName || 'GeneratedComponent',
  };
}
