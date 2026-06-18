import type { AIProvider } from './AIProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { GroqProvider } from './GroqProvider.js';

/** Retourne le fournisseur IA selon AI_PROVIDER dans .env. */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? 'gemini';
  if (provider === 'ollama') return new OllamaProvider();
  if (provider === 'openai') return new OpenAIProvider();
  if (provider === 'groq')   return new GroqProvider();
  return new GeminiProvider();
}

export type { AIProvider, AnalysisResult } from './AIProvider.js';
