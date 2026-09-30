import dotenv from 'dotenv';
import { LLMGenerator } from './backend/generation/llmGenerator.js';
import type { RedesignRequest } from './shared/contracts/redesign.js';

dotenv.config();

async function runTest() {
  const mockRedesignRequest: RedesignRequest = {
    sessionId: "sess_998124",
    currentUI: { name: "payment_form" },
    cognitiveSignals: ["multiple validation errors", "hesitation on input fields"],
    currentState: { amount: 150, currency: "USD" },
    allowedComponents: ["div", "button", "input", "form", "label"]
  };

  console.log("1. Initializing canonical RedesignRequest...");
  console.log("2. Running AI Generation (Stopping strictly at GeneratedUI contract)...");

  try {
    const generator = new LLMGenerator();
    const result = await generator.generate(mockRedesignRequest);

    console.log("\n-> Verifying GeneratedUI Contract types...");
    const isValidContract = 
      typeof result.code === 'string' &&
      typeof result.componentName === 'string' &&
      Array.isArray(result.dependencies) &&
      result.metadata !== null && 
      typeof result.metadata === 'object';

    if (isValidContract) {
      console.log("-> Contract Verification PASSED:");
      console.log(`   - code: ${typeof result.code} (${result.code.length} chars)`);
      console.log(`   - componentName: ${result.componentName}`);
      console.log(`   - dependencies: Array[${result.dependencies.length}]`);
      console.log(`   - generationLatencyMs: ${result.metadata.generationLatencyMs}ms`);
    } else {
      throw new Error("GeneratedUI contract validation failed!");
    }

    console.log("\n-> Final GeneratedUI Object:\n", JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error("\n-> Test Failed with Error:", error.message);
  }
}

runTest();