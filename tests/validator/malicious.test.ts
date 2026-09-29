import { describe, it, expect } from "vitest";
import { validateGeneratedUI } from "../../validator/validator/validateGeneratedUI.js";

function expectRejected(code: string, expectedPathPrefix: string) {
  const result = validateGeneratedUI(code);
  expect(result.ok).toBe(false);
  expect(result.issues.some((i) => i.path.startsWith(expectedPathPrefix))).toBe(true);
}

describe("validateGeneratedUI — malicious code", () => {
  it("rejects eval()", () => {
    expectRejected(
      `function App() { eval("alert('test')"); return <div>Hello</div>; }`,
      "call:eval"
    );
  });

  it("rejects new Function()", () => {
    expectRejected(
      `function App() { const f = new Function("return process"); return <div />; }`,
      "call:Function"
    );
  });

  it("rejects fs import", () => {
    expectRejected(
      `import fs from "fs"; function App() { return <div />; }`,
      "import:fs"
    );
  });

  it("rejects child_process import", () => {
    expectRejected(
      `import child_process from "child_process"; function App() { return <div />; }`,
      "import:child_process"
    );
  });

  it("rejects dynamic import", () => {
    expectRejected(
      `function App() { const mod = import("something"); return <div />; }`,
      "call:import()"
    );
  });

  it("rejects fetch()", () => {
    expectRejected(
      `function App() { fetch("https://example.com"); return <div />; }`,
      "call:fetch"
    );
  });

  it("rejects new WebSocket()", () => {
    expectRejected(
      `function App() { const ws = new WebSocket("wss://example.com"); return <div />; }`,
      "call:WebSocket"
    );
  });
  it("rejects require()", () => {
  const result = validateGeneratedUI(
    `function App() { const fs = require("fs"); return <div />; }`
  );

  console.log("REQUIRE RESULT:", JSON.stringify(result, null, 2));

  expectRejected(
    `function App() { const fs = require("fs"); return <div />; }`,
    "call:require"
  );
});
});