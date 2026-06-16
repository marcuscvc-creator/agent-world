// Token pricing per 1M tokens (input / output) as of mid-2025
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":               { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":          { input: 0.15,  output: 0.60  },
  "gpt-4-turbo":          { input: 10.00, output: 30.00 },
  "gpt-4":                { input: 30.00, output: 60.00 },
  "gpt-3.5-turbo":        { input: 0.50,  output: 1.50  },
  "o1":                   { input: 15.00, output: 60.00 },
  "o1-mini":              { input: 3.00,  output: 12.00 },
  "o3-mini":              { input: 1.10,  output: 4.40  },
};

const DEFAULT_PRICING = { input: 0.15, output: 0.60 }; // gpt-4o-mini fallback

export function calculateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  // Normalize model name (strip date suffixes like -2024-07-18)
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-preview$/, "");
  const pricing = PRICING[base] ?? PRICING[model] ?? DEFAULT_PRICING;

  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function formatCostUsd(cost: number): string {
  if (cost < 0.0001) return `$${(cost * 1000).toFixed(4)}m`; // millicents
  if (cost < 0.01) return `$${(cost * 100).toFixed(3)}¢`;
  return `$${cost.toFixed(4)}`;
}
