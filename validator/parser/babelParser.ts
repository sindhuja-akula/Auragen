import { parse } from "@babel/parser";
import type { File } from "@babel/types";

export type ParseResult =
  | { success: true; ast: File }
  | { success: false; error: string };

export function parseCode(source: string): ParseResult {
  try {
    const ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"]
    });

    return {
      success: true,
      ast: ast as unknown as File
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown parse error"
    };
  }
}