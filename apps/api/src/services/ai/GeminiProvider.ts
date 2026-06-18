import { GoogleGenAI } from '@google/genai';
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

Pour extractedFields, extrais les champs pertinents selon le type de document :
- Facture : montant_total, date_facture, fournisseur, numero_facture
- Contrat : parties, date_signature, duree, objet
- RH : nom_employe, poste, date_debut
- Rapport : periode, auteur, sujet_principal
- Si aucun champ pertinent : laisse extractedFields vide {}
`;

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY manquante dans .env');
    this.genAI = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite';
  }

  async analyzeDocument(text: string, filename: string): Promise<AnalysisResult> {
    const response = await this.genAI.models.generateContent({
      model: this.model,
      contents: ANALYSIS_PROMPT(filename, text),
    });
    const raw = response.text ?? '';

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
      return {
        summary: raw.slice(0, 500),
        suggestedCategory: null,
        extractedFields: {},
        confidence: 0.3,
        rawResponse: raw,
      };
    }
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.genAI.models.generateContent({
      model: this.model,
      contents: prompt,
    });
    return response.text ?? '';
  }
}
