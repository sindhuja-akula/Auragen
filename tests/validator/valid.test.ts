import { describe, it, expect } from "vitest";
import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

describe("validateGeneratedUI — valid code", () => {
  it("passes a simple valid component", () => {
    const result = validateGeneratedUI(`
      import React from "react";
      function Form() {
        return <button>Submit</button>;
      }
    `);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("passes a component using useState/useEffect", () => {
    const result = validateGeneratedUI(`
      import React, { useState, useEffect } from "react";
      function Counter() {
        const [count, setCount] = useState(0);
        useEffect(() => { console.log(count); }, [count]);
        return (
          <div>
            <p>{count}</p>
            <button onClick={() => setCount(count + 1)}>Increment</button>
          </div>
        );
      }
    `);
    expect(result.valid).toBe(true);
  });

  it("passes an arrow function component", () => {
    const result = validateGeneratedUI(`
      import React from "react";
      const Greeting = () => <div>Hello</div>;
    `);
    expect(result.valid).toBe(true);
  });

  it("passes an arrow function component with a block body", () => {
    const result = validateGeneratedUI(`
      import React from "react";
      const Greeting = () => {
        return <div>Hello</div>;
      };
    `);
    expect(result.valid).toBe(true);
  });
});
