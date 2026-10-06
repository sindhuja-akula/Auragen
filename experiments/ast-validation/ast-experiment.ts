import { parseCode } from "../../validator/parser/babelParser.js";
import traverseImport from "@babel/traverse";

const traverse: any =
  (traverseImport as any).default ?? (traverseImport as any);

const validCode = `
function SimpleForm() {
  return (
    <div>
      <input />
      <button>Submit</button>
    </div>
  );
}
`;

const invalidCode = `
function MyComponent( {
`;

function run(label: string, code: string) {
  console.log(`\n=== ${label} ===`);
  const result = parseCode(code);

  if (!result.success) {
    console.log("Parse result: FAILED");
    console.log("Error:", result.error);
    return;
  }

  console.log("Parse result: SUCCESS");
  traverse(result.ast, {
    FunctionDeclaration(path: any) {
      console.log(
  "Function:",
  (path.node as import("@babel/types").FunctionDeclaration).id?.name
);
    },
    JSXElement(path: any) {
      const name = (
  path.node as import("@babel/types").JSXElement
).openingElement.name;
      console.log("JSX Element:", name.type === "JSXIdentifier" ? name.name : "(complex)");
    }
  });
}

run("Valid React component", validCode);
run("Invalid syntax", invalidCode);
