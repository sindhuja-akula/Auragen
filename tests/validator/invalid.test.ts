import { describe, it, expect } from "vitest";
import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

describe("validateGeneratedUI — invalid code", () => {
  it("rejects malformed syntax", () => {
    const result = validateGeneratedUI(`function MyComponent( {`);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "syntax")).toBe(true);
  });

  it("rejects an unapproved (but not forbidden) import", () => {
    const result = validateGeneratedUI(`
      import someUnknownLibrary from "some-unknown-library";
      function Form() { return <button>Submit</button>; }
    `);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("not in the approved allowlist"))
    ).toBe(true);
  });

  it("rejects code that isn't a component at all", () => {
    const result = validateGeneratedUI(`
      import React from "react";
      function helper() { return 1 + 1; }
    `);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "structure")).toBe(true);
  });

  it("rejects empty source", () => {
    const result = validateGeneratedUI("");
    expect(result.ok).toBe(false);
    expect(result.issues[0].path).toBe("source");
  });
});
