import { describe, it, expect } from "vitest";
import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

// The system must never crash because the LLM produced bad output.
describe("validateGeneratedUI — failure handling", () => {
  it("rejects truncated syntax without throwing", () => {
    expect(() => validateGeneratedUI(`function Broken( {`)).not.toThrow();
    expect(validateGeneratedUI(`function Broken( {`).valid).toBe(false);
  });

  it("rejects empty input without throwing", () => {
    expect(() => validateGeneratedUI("")).not.toThrow();
    expect(validateGeneratedUI("").valid).toBe(false);
  });

  it("rejects garbage input without throwing", () => {
    expect(() => validateGeneratedUI("<<<not even close to code>>>")).not.toThrow();
    expect(validateGeneratedUI("<<<not even close to code>>>").valid).toBe(false);
  });

  it("rejects valid syntax with a security violation, not just a parse failure", () => {
    const result = validateGeneratedUI(
      `import fs from "fs"; function App() { return <div />; }`
    );
    expect(result.valid).toBe(false);
  });

  it("rejects valid syntax that isn't a component", () => {
    const result = validateGeneratedUI(`import React from "react"; const x = 1 + 1;`);
    expect(result.valid).toBe(false);
  });
});
