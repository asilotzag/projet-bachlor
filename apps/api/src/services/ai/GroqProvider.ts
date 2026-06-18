import OpenAI from 'openai';
import type { AIProvider, AnalysisResult } from './AIProvider.js';

const ANALYSIS_PROMPT = (filename: string, text: string) => `
Tu es un assistant d'analyse documentaire pour une plateforme de gestion d'entreprise.
Analyse le document suivant et réponds UNIQUEMENT en JSON valide, sans markdown.

Nom du fichier : ${filename}
Contenu (extrait) :
---
${text.slice(0, 6000)}
---

Réponds avec ce format JSON exact :
{
  "summary": "résumé clair en 2-3 phrases",
  "suggestedCategory": "une parmi : Contrats, Factures, RH, Rapports, Juridique, Technique, Autre (ou null si non applicable)",
  "extractedFields": { "clé": "valeur" },
  "confidence": 0.85
}
`;

export class GroqProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY manquante dans .env');
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  }

  async analyzeDocument(text: string, filename: string): Promise<AnalysisResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: ANALYSIS_PROMPT(filename, text) }],
      temperature: 0.2,
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    try {
      const clean = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      return {
        summary: parsed.summary ?? 'Analyse indisponible',
        suggestedCategory: parsed.suggestedCategory ?? null,
        extractedFields: parsed.extractedFields ?? {},
        confidence: Number(parsed.confidence ?? 0.7),
        rawResponse: raw,
      };
    } catch {
      return { summary: raw.slice(0, 500), suggestedCategory: null, extractedFields: {}, confidence: 0.3, rawResponse: raw };
    }
  }

  async generate(prompt: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content ?? '';
  }
}
