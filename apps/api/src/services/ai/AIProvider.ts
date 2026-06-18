/**
 * Interface commune pour tous les fournisseurs IA.
 * Changer AI_PROVIDER dans .env bascule entre Gemini et Ollama
 * sans toucher au code applicatif.
 */

export interface AnalysisResult {
  summary: string;
  suggestedCategory: string | null;
  extractedFields: Record<string, string>;
  confidence: number; // 0-1
  rawResponse: string;
}

export interface AIProvider {
  /** Analyse un texte extrait d'un document et retourne un résumé structuré. */
  analyzeDocument(text: string, filename: string): Promise<AnalysisResult>;
  /** Génère du texte libre à partir d'une instruction et d'un contexte. */
  generate(prompt: string): Promise<string>;
}
