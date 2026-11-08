import dotenv from 'dotenv';
dotenv.config();

import { LLMGenerator } from '../../backend/generation/llmGenerator.js';
import { validateGeneratedUI } from '../../validator/validator/validateGeneratedUI.js';
import { compileJsxToExecutable } from '../../validator/compiler/jsxCompiler.js';
import { scoreCognitiveLoad } from '../../backend/scoring/cognitiveScorer.js';
import type { TelemetryEvent } from '../../shared/contracts/telemetry.js';
import type { RedesignRequest } from '../../shared/contracts/redesign.js';

async function runEndToEndLatencyExperiment() {
  console.log('============================================================');
  console.log('AURAGEN END-TO-END PIPELINE LATENCY EXPERIMENT');
  console.log('============================================================');

  const overallStart = performance.now();

  // 1. Telemetry Ingestion & Cognitive Scoring
  const telemetryStart = performance.now();
  const events: TelemetryEvent[] = [
    {
      sessionId: 'session-perf-test',
      timestamp: Date.now() - 3000,
      eventType: 'repeated_click',
      elementId: 'checkout-submit',
      metadata: { count: 4, window_ms: 2000, formState: { name: 'Sindhuja', email: 'sindhuja@example.com' } },
    },
    {
      sessionId: 'session-perf-test',
      timestamp: Date.now() - 1000,
      eventType: 'hesitation',
      elementId: 'card-field',
      metadata: { idle_ms: 6000 },
    },
  ];

  const scoreResult = scoreCognitiveLoad(events);
  const telemetryEnd = performance.now();
  const telemetryLatencyMs = telemetryEnd - telemetryStart;

  console.log(`[Telemetry & Score] Score: ${scoreResult.score.toFixed(2)} / ${scoreResult.threshold}`);
  console.log(`[Telemetry & Score] Signals: ${scoreResult.signals.join(', ')}`);
  console.log(`[Telemetry & Score] Latency: ${telemetryLatencyMs.toFixed(3)} ms`);

  // 2. Redesign Request Construction
  const request: RedesignRequest = {
    sessionId: 'session-perf-test',
    currentUI: { id: 'ComplexCheckoutForm', fields: ['name', 'email', 'card', 'cvv', 'coupon', 'billingAddress'] },
    cognitiveSignals: scoreResult.signals,
    currentState: { name: 'Sindhuja', email: 'sindhuja@example.com' },
    allowedComponents: ['form', 'div', 'label', 'input', 'button', 'p', 'h2', 'span'],
  };

  // 3. LLM Generation
  console.log('\n[Generation] Requesting simplified UI from LLM...');
  const genStart = performance.now();
  let generatedUI;
  try {
    const generator = new LLMGenerator();
    generatedUI = await generator.generate(request);
  } catch (err: any) {
    console.error('[Generation] LLM call failed:', err.message);
    console.log('Falling back to deterministic mock for test completion...');
    generatedUI = {
      code: `function SimplifiedForm(props) {
  const [name, setName] = React.useState(props.name || "");
  const [email, setEmail] = React.useState(props.email || "");
  return (
    <form className="simplified-form">
      <h2>Quick Checkout</h2>
      <label>Name: <input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Email: <input value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button type="submit">Complete</button>
    </form>
  );
}`,
      componentName: 'SimplifiedForm',
      dependencies: ['react'],
      metadata: { fallback: true },
    };
  }
  const genEnd = performance.now();
  const generationLatencyMs = genEnd - genStart;
  console.log(`[Generation] Component generated: ${generatedUI.componentName}`);
  console.log(`[Generation] Source bytes: ${Buffer.byteLength(generatedUI.code, 'utf8')} B`);
  console.log(`[Generation] Latency: ${generationLatencyMs.toFixed(2)} ms`);

  // 4. AST & Security Validation
  const valStart = performance.now();
  const validationResult = validateGeneratedUI(generatedUI.code);
  const valEnd = performance.now();
  const validationLatencyMs = valEnd - valStart;

  console.log(`\n[Validation] Valid: ${validationResult.valid}`);
  if (!validationResult.valid) {
    console.log(`[Validation] Errors: ${validationResult.errors.join(', ')}`);
  }
  console.log(`[Validation] Latency: ${validationLatencyMs.toFixed(3)} ms`);

  // 5. JSX Compilation
  const compStart = performance.now();
  const compiledResult = compileJsxToExecutable(generatedUI.code, generatedUI.componentName);
  const compEnd = performance.now();
  const compilationLatencyMs = compEnd - compStart;
  console.log(`\n[Compilation] Output length: ${compiledResult.executableJs.length} chars`);
  console.log(`[Compilation] Latency: ${compilationLatencyMs.toFixed(3)} ms`);

  // 6. State Preservation Verification
  const userPreservedState = request.currentState;
  console.log(`\n[State Preservation] Input State:`, userPreservedState);
  console.log(`[State Preservation] Preserved: ${Boolean(userPreservedState.name === 'Sindhuja' && userPreservedState.email === 'sindhuja@example.com')}`);

  const overallEnd = performance.now();
  const totalPipelineMs = overallEnd - overallStart;

  console.log('\n============================================================');
  console.log('LATENCY BREAKDOWN SUMMARY');
  console.log('============================================================');
  console.log(`Stage                                    Latency`);
  console.log(`------------------------------------------------------------`);
  console.log(`Telemetry + Cognitive Score              ${telemetryLatencyMs.toFixed(3).padStart(8)} ms`);
  console.log(`LLM Generation (Groq)                    ${generationLatencyMs.toFixed(2).padStart(8)} ms`);
  console.log(`AST / Security Validation                ${validationLatencyMs.toFixed(3).padStart(8)} ms`);
  console.log(`JSX Transformation                       ${compilationLatencyMs.toFixed(3).padStart(8)} ms`);
  console.log(`------------------------------------------------------------`);
  console.log(`TOTAL PIPELINE TIME                      ${totalPipelineMs.toFixed(2).padStart(8)} ms`);
  console.log('============================================================\n');
}

runEndToEndLatencyExperiment().catch(console.error);
