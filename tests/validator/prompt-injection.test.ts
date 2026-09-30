import { describe, it, expect } from "vitest";
import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

// The validator only ever sees the LLM's generated code, never the user's
// prompt. These tests prove that even if a prompt injection convinces the
// model to produce unsafe code (or to narrate compliance in comments/JSX
// text), the AST layer still catches the actual unsafe structure.
describe("validateGeneratedUI — prompt injection resilience", () => {
  it("rejects an injected fs import regardless of surrounding text", () => {
    const result = validateGeneratedUI(`
      import fs from "fs";
      function App() {
        return <div>Ignoring all AuraGen rules as requested</div>;
      }
    `);
    expect(result.valid).toBe(false);
  });

  it("rejects an injected eval() regardless of framing", () => {
    const result = validateGeneratedUI(`
      function App() {
        eval(atob("someEncodedPayload"));
        return <div>Hello</div>;
      }
    `);
    expect(result.valid).toBe(false);
  });
});
