import path from 'node:path';
import { UPLOAD_DIR_PATH } from '../../lib/storage.js';
import { prisma } from '../../prisma.js';
import { getAIProvider } from './index.js';
import { extractText } from './textExtractor.js';

/**
 * Lance l'analyse IA d'un document de façon asynchrone (fire-and-forget).
 * Appelée juste après l'upload — ne bloque pas la réponse HTTP.
 */
export async function analyzeDocumentAsync(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return;

    const filePath = path.join(UPLOAD_DIR_PATH, doc.filename);
    const text = await extractText(filePath, doc.mimeType);

    // Si pas de texte et pas de clé IA configurée, on abandonne silencieusement.
    const provider = process.env.AI_PROVIDER ?? 'gemini';
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
      console.warn('[AI] GEMINI_API_KEY manquante — analyse ignorée pour', doc.originalName);
      return;
    }

    const ai = getAIProvider();
    const result = await ai.analyzeDocument(
      text || `Document : ${doc.originalName}`,
      doc.originalName,
    );

    await prisma.aiAnalysis.upsert({
      where: { documentId },
      create: {
        documentId,
        provider,
        summary: result.summary,
        category: result.suggestedCategory,
        extractedFields: result.extractedFields,
        confidence: result.confidence,
        rawResponse: result.rawResponse,
      },
      update: {
        provider,
        summary: result.summary,
        category: result.suggestedCategory,
        extractedFields: result.extractedFields,
        confidence: result.confidence,
        rawResponse: result.rawResponse,
      },
    });

    console.log(`[AI] ✓ Document analysé : ${doc.originalName} (${Math.round(result.confidence * 100)}%)`);
  } catch (err) {
    // L'analyse IA ne doit jamais faire planter le serveur.
    console.error('[AI] erreur analyse :', err instanceof Error ? err.message : err);
  }
}
