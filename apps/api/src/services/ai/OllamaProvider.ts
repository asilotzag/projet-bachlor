import type { AIProvider, AnalysisResult } from './AIProvider.js';

/**
 * Fournisseur IA local via Ollama (Llama, Mistral...).
 * Zéro coût, fonctionne hors ligne.
 * Installer Ollama : https://ollama.ai — puis : ollama pull llama3.1
 */
export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL ?? 'llama3.1';
  }

  private async chat(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json() as { response: string };
    return data.response;
  }

  async analyzeDocument(text: string, filename: string): Promise<AnalysisResult> {
    const prompt = `Tu es un assistant d'analyse documentaire pour une entreprise. Lis le document ci-dessous et produis UNIQUEMENT un objet JSON (pas de texte, pas de markdown).

Fichier: ${filename}
Contenu:
${text.slice(0, 3000)}

Règles:
- "summary": résumé clair et détaillé en 3-4 phrases décrivant le contenu réel du document
- "suggestedCategory": choisis parmi Contrats, Factures, RH, Rapports, Juridique, Technique, Autre
- "extractedFields": objet avec les informations clés trouvées dans le document (ex: auteur, date, titre, sujet). Si rien à extraire, mets {}
- "confidence": nombre entre 0 et 1 selon ta certitude

Réponds uniquement avec ce JSON:
{"summary":"...","suggestedCategory":"...","extractedFields":{},"confidence":0.8}`;

    const raw = await this.chat(prompt);

    // Extrait le premier objet JSON trouvé dans la réponse, même entouré de texte
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary ?? 'Analyse indisponible',
          suggestedCategory: parsed.suggestedCategory ?? null,
          extractedFields: parsed.extractedFields ?? {},
          confidence: Number(parsed.confidence ?? 0.7),
          rawResponse: raw,
        };
      } catch { /* JSON malformé, fallback ci-dessous */ }
    }

    return { summary: raw.slice(0, 400), suggestedCategory: null, extractedFields: {}, confidence: 0.3, rawResponse: raw };
  }

  async generate(prompt: string): Promise<string> {
    return this.chat(prompt);
  }
}
