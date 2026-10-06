import { describe, expect, it } from 'vitest';

import { GenerationValidator } from '../../backend/generation/generationValidator.js';

describe('GenerationValidator', () => {
  it('rejects null input', () => {
    expect(() => GenerationValidator.validate(null)).toThrow();
  });

  it('rejects array input', () => {
    expect(() => GenerationValidator.validate([])).toThrow();
  });

  it('rejects primitive input', () => {
    expect(() => GenerationValidator.validate('hello')).toThrow();
  });

  it('rejects an object with missing code', () => {
    expect(() =>
      GenerationValidator.validate({
        componentName: 'TestUI',
        dependencies: [],
        metadata: {},
      }),
    ).toThrow();
  });

  it('rejects empty code', () => {
    expect(() =>
      GenerationValidator.validate({
        code: '',
        componentName: 'TestUI',
        dependencies: [],
        metadata: {},
      }),
    ).toThrow();
  });

  it('rejects missing componentName', () => {
    expect(() =>
      GenerationValidator.validate({
        code: 'return <div />;',
        dependencies: [],
        metadata: {},
      }),
    ).toThrow();
  });

  it('rejects dependencies when they are not an array', () => {
    expect(() =>
      GenerationValidator.validate({
        code: 'return <div />;',
        componentName: 'TestUI',
        dependencies: 'react',
        metadata: {},
      }),
    ).toThrow();
  });

  it('rejects non-string dependency values', () => {
    expect(() =>
      GenerationValidator.validate({
        code: 'return <div />;',
        componentName: 'TestUI',
        dependencies: ['react', 123],
        metadata: {},
      }),
    ).toThrow();
  });

  it('rejects missing metadata', () => {
    expect(() =>
      GenerationValidator.validate({
        code: 'return <div />;',
        componentName: 'TestUI',
        dependencies: [],
      }),
    ).toThrow();
  });

  it('rejects metadata when it is not an object', () => {
    expect(() =>
      GenerationValidator.validate({
        code: 'return <div />;',
        componentName: 'TestUI',
        dependencies: [],
        metadata: [],
      }),
    ).toThrow();
  });

  it('accepts a valid GeneratedUI object', () => {
    const result = GenerationValidator.validate({
      code: 'return <div />;',
      componentName: 'TestUI',
      dependencies: ['react'],
      metadata: {
        generationLatencyMs: 120,
      },
    });

    expect(result).toEqual({
      code: 'return <div />;',
      componentName: 'TestUI',
      dependencies: ['react'],
      metadata: {
        generationLatencyMs: 120,
      },
    });
  });

  it('rejects unexpected fields', () => {
    expect(() =>
      GenerationValidator.validate({
        code: 'return <div />;',
        componentName: 'TestUI',
        dependencies: [],
        metadata: {},
        adminOverride: true,
      }),
    ).toThrow();
  });
});