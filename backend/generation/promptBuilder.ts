import type { RedesignRequest } from '../../shared/contracts/redesign.js';

export class PromptBuilder {
  static preparePrompt(request: RedesignRequest) {
    const {
      sessionId = "unknown_session",
      currentUI = {},
      cognitiveSignals = [],
      currentState = {},
      allowedComponents = ["div", "button", "input", "form", "label", "span"]
    } = request;

    const systemPrompt = `You are an expert AI UI adaptation engine (AuraGen). Your task is to generate clean, self-contained, functional React component code based on user cognitive friction signals and telemetry.
CRITICAL CONSTRAINTS:
1. Return ONLY valid JSON containing 'code', 'componentName', 'dependencies', and 'rationale'. No conversational markdown outside the JSON.
2. The 'code' property must be a valid, executable React component function string using standard JSX (e.g., "export function AdaptedComponent(props) { return (...); }").
3. Use ONLY these allowed UI building blocks/primitives: ${JSON.stringify(allowedComponents)}.
4. Preserve necessary input names and state bindings from currentState.
5. Keep the layout simplified to reduce user cognitive load. The objective is to resolve demonstrated difficulty, not to redesign the application arbitrarily.`;

    const userPrompt = JSON.stringify({
      sessionId,
      targetUIComponent: currentUI,
      cognitiveSignals,
      currentState,
      allowedComponents,
      instruction: "Generate an adapted React component configuration matching the GeneratedUI contract to resolve the user's friction."
    }, null, 2);

    return { systemPrompt, userPrompt };
  }
}