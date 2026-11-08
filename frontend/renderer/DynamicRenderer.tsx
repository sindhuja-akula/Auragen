import React, { useMemo, useState } from 'react';
import type { GeneratedUI } from '../../shared/contracts/generated-ui.js';
import { loadControlledComponent } from './componentLoader.js';
import { ErrorBoundary } from './ErrorBoundary.js';

export type DynamicRendererProps = {
  tree: unknown;
  fallback?: React.ReactNode;
  initialValues?: Record<string, unknown>;
  onStateChange?: (state: Record<string, unknown>) => void;
  onSubmit?: (data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
};

function isGeneratedUIObject(value: unknown): value is GeneratedUI {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'string' && candidate.code.length > 0;
}

function extractGeneratedUI(tree: unknown): GeneratedUI | null {
  if (isGeneratedUIObject(tree)) {
    return tree;
  }
  if (tree && typeof tree === 'object') {
    const record = tree as Record<string, unknown>;
    if (isGeneratedUIObject(record.generatedUI)) {
      return record.generatedUI;
    }
  }
  return null;
}

type LegacyTreeNode = {
  type: string;
  props?: Record<string, unknown>;
  children?: LegacyTreeNode[];
};

function renderLegacyTree(node: unknown, initialValues: Record<string, unknown>): React.ReactNode {
  if (!node || typeof node !== 'object') return null;
  const tree = node as Record<string, unknown>;

  if (Array.isArray(tree.children)) {
    return (
      <div className="adapted-tree-container">
        {tree.children.map((child: any, idx: number) => {
          if (!child || typeof child !== 'object') return null;
          const type = (child.type || 'div').toLowerCase();
          const props = child.props || {};

          if (type === 'label') {
            return (
              <label key={idx} htmlFor={props.htmlFor as string} style={{ display: 'block', margin: '8px 0 4px' }}>
                {props.text || props.children || 'Label'}
              </label>
            );
          }
          if (type === 'input') {
            const name = (props.name || props.id || 'field') as string;
            const defaultValue = (initialValues[name] as string) || props.value || '';
            return (
              <input
                key={idx}
                id={name}
                name={name}
                defaultValue={defaultValue}
                placeholder={props.placeholder as string}
                style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
              />
            );
          }
          if (type === 'button') {
            return (
              <button key={idx} type="submit" style={{ padding: '8px 16px', marginTop: '8px' }}>
                {props.text || props.children || 'Submit'}
              </button>
            );
          }
          return <div key={idx}>{props.text || props.children || null}</div>;
        })}
      </div>
    );
  }

  return null;
}

export function DynamicRenderer({
  tree,
  fallback,
  initialValues = {},
  onStateChange,
  onSubmit,
  onError,
}: DynamicRendererProps) {
  const [loadError, setLoadError] = useState<Error | null>(null);

  const Component = useMemo(() => {
    setLoadError(null);
    const generated = extractGeneratedUI(tree);
    if (!generated) return null;

    try {
      return loadControlledComponent(generated);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn('[DynamicRenderer] Controlled loading error:', error.message);
      setLoadError(error);
      onError?.(error);
      return null;
    }
  }, [tree, onError]);

  // If loading failed, render fallback seamlessly
  if (loadError) {
    if (fallback) {
      return (
        <div data-render-tree={JSON.stringify(tree)}>
          <div className="auragen-adaptation-notice fallback-active">
            We couldn't adapt the interface right now. Your current interface remains active.
          </div>
          {fallback}
        </div>
      );
    }
    return (
      <div data-render-tree={JSON.stringify(tree)} className="auragen-render-fallback">
        <p>We couldn't adapt the interface right now.</p>
      </div>
    );
  }

  // If a live controlled React component was compiled
  if (Component) {
    return (
      <div data-render-tree={JSON.stringify(tree)} className="auragen-dynamic-container">
        <ErrorBoundary fallback={fallback} onError={onError}>
          <Component
            initialValues={initialValues}
            onStateChange={onStateChange}
            onSubmit={onSubmit}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // If a legacy mock tree was passed (e.g. from tests)
  const legacyContent = renderLegacyTree(tree, initialValues);
  if (legacyContent) {
    return (
      <div data-render-tree={JSON.stringify(tree)} className="auragen-dynamic-container">
        {legacyContent}
      </div>
    );
  }

  // Backward compatibility fallback for tests checking data-render-tree
  return <div data-render-tree={JSON.stringify(tree)} />;
}
