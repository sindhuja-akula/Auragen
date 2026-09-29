import { parseCode } from "../../validator/parser/babelParser.js";
import traverseImport from "@babel/traverse";

const traverse: typeof traverseImport =
  typeof traverseImport === "function" ? traverseImport : (traverseImport as any).default;

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
    FunctionDeclaration(path) {
      console.log("Function:", path.node.id?.name);
    },
    JSXElement(path) {
      const name = path.node.openingElement.name;
      console.log("JSX Element:", name.type === "JSXIdentifier" ? name.name : "(complex)");
    }
  });
}

run("Valid React component", validCode);
run("Invalid syntax", invalidCode);
