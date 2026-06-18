import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// pdf-parse est un module CommonJS — on l'importe via createRequire en contexte ESM
const require = createRequire(import.meta.url);
// pdf-parse/lib/pdf-parse.js évite le chargement du fichier de test qui casse en ESM
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');

/**
 * Extrait le texte brut d'un fichier selon son type MIME.
 * Retourne une chaîne vide si l'extraction échoue (l'analyse IA reste possible
 * avec le nom du fichier comme contexte minimal).
 */
export async function extractText(filePath: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text.trim();
    }

    if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      return fs.readFileSync(filePath, 'utf-8');
    }

    // Pour les images (JPEG, PNG...) et les fichiers Word/Excel,
    // on retourne le nom du fichier comme contexte minimal.
    // Tesseract.js peut être branché ici à la Phase 6 pour l'OCR réel.
    return `[Fichier de type ${mimeType} — ${path.basename(filePath)}]`;
  } catch (err) {
    console.error('[textExtractor] échec extraction :', err);
    return '';
  }
}
