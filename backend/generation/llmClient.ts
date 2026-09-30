import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

export class LLMClient {
  private groq: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("Configuration Error: GROQ_API_KEY environment variable is missing.");
    }
    this.groq = new Groq({ apiKey });
  }

  async call(systemPrompt: string, userPrompt: string): Promise<{ rawResponse: any; latencyMs: number }> {
    const startTime = performance.now();
    try {
      const response = await this.groq.chat.completions.create({
        model: "openai/gpt-oss-20b", // Reverted back to your supported model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      let content = response.choices[0]?.message?.content;
      if (!content || typeof content !== 'string' || content.trim() === '') {
        throw new Error("Provider Error: Received empty response from Groq.");
      }

      // Robustly extract JSON block if wrapped in markdown or extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Parsing Error: No valid JSON object found in LLM response.");
      }

      const rawResponse = JSON.parse(jsonMatch[0]);
      return { rawResponse, latencyMs };
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        throw new Error(`Parsing Error: LLM returned malformed JSON: ${error.message}`);
      }
      throw new Error(`LLM Generation Failed: ${error.message}`);
    }
  }
}