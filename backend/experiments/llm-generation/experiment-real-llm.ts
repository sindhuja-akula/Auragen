import dotenv from 'dotenv';
import { LLMGenerator } from '../../generation/llmGenerator.js';
import type { RedesignRequest } from '../../../shared/contracts/redesign.js';
dotenv.config();

async function runRealLLMExperiment() {
  const mockRedesignRequest: RedesignRequest = {
    sessionId: "sess_998124",
    currentUI: { name: "payment_form" },
    cognitiveSignals: ["multiple validation errors", "hesitation on input fields"],
    currentState: { amount: 150, currency: "USD" },
    allowedComponents: ["div", "button", "input", "form", "label"]
  };

  console.log("==================================================");
  console.log("EXPERIMENT: Live Groq LLM UI Generation");
  console.log("==================================================");
  console.log("1. Initializing canonical RedesignRequest...");
  console.log("2. Sending request to Groq API (openai/gpt-oss-20b)...");

  try {
    const generator = new LLMGenerator();
    const result = await generator.generate(mockRedesignRequest);

    console.log("\n-> Generation Successful!");
    console.log(`   - Target Component: ${result.componentName}`);
    console.log(`   - Code Length: ${result.code.length} characters`);
    console.log(`   - Dependencies: [${result.dependencies.join(', ')}]`);
    console.log(`   - Latency: ${result.metadata.generationLatencyMs}ms`);

    console.log("\n-> GeneratedUI Output:\n", JSON.stringify(result, null, 2));
  } catch (error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unknown experiment error';

  console.error("\n-> Experiment Failed with Error:", message);
}
}

runRealLLMExperiment();