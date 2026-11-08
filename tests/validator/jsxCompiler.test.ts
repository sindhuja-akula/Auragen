import { describe, expect, it } from 'vitest';
import { compileJsxToExecutable } from '../../validator/compiler/jsxCompiler.js';
import { validateGeneratedUI } from '../../validator/validator/validateGeneratedUI.js';

describe('compileJsxToExecutable', () => {
  it('compiles standard React function component with JSX into React.createElement', () => {
    const source = `
      import React, { useState } from 'react';

      function SimpleForm({ initialValues, onSubmit }) {
        const [name, setName] = useState(initialValues?.name || '');

        return (
          <form onSubmit={onSubmit}>
            <label htmlFor="name">Full Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit">Submit</button>
          </form>
        );
      }

      export default SimpleForm;
    `;

    const validation = validateGeneratedUI(source);
    expect(validation.valid).toBe(true);

    const { executableJs, detectedComponentName } = compileJsxToExecutable(source, 'SimpleForm');
    expect(detectedComponentName).toBe('SimpleForm');
    expect(executableJs).not.toContain('<form');
    expect(executableJs).not.toContain('<input');
    expect(executableJs).toContain('React.createElement("form"');
    expect(executableJs).toContain('React.createElement("input"');
    expect(executableJs).toContain('React.createElement("button"');
  });

  it('compiles arrow function React component with fragment and spread props', () => {
    const source = `
      import React from 'react';

      const QuickCard = (props) => {
        return (
          <>
            <div className="card" {...props}>
              <h2>Title</h2>
              <p>Description</p>
            </div>
          </>
        );
      };

      export default QuickCard;
    `;

    const validation = validateGeneratedUI(source);
    expect(validation.valid).toBe(true);

    const { executableJs, detectedComponentName } = compileJsxToExecutable(source);
    expect(detectedComponentName).toBe('QuickCard');
    expect(executableJs).toContain('React.Fragment');
    expect(executableJs).toContain('React.createElement("div"');
  });
});
