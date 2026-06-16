import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// Model aliases — change DEFAULT_MODEL env var to override
export const MODELS = {
  default: (process.env.DEFAULT_MODEL ?? "gpt-4o-mini") as string,
  fast: "gpt-4o-mini",
  smart: "gpt-4o",
} as const;

export type ModelAlias = keyof typeof MODELS;
