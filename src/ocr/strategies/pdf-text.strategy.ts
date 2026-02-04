import { OcrProviderStrategy, OcrResult } from './ocr-provider.interface';
import * as fs from 'fs';
import { BaseExtractor } from './base-extractor.strategy';
import { defaultLogger as log } from '../../common/fi-logger.config';
// Intentamos varias formas de importación para pdf-parse
const pdfParse = require('pdf-parse');

export class PdfTextStrategy extends BaseExtractor implements OcrProviderStrategy {
  getName(): string {
    return 'PdfText';
  }

  getSupportedMimeTypes(): string[] {
    return ['application/pdf'];
  }

  async process(fileUrl: string, jsonSchema: any): Promise<OcrResult> {
    try {
      log.info(`[PdfText] Extracting text from: ${fileUrl}`);
      const dataBuffer = fs.readFileSync(fileUrl);
      
      // Manejo de importación resiliente
      const parseFunction = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
      
      if (typeof parseFunction !== 'function') {
        throw new Error('pdf-parse library not loaded correctly as a function');
      }

      const pdfData = await parseFunction(dataBuffer);

      if (!pdfData.text || pdfData.text.trim().length === 0) {
        return { success: false, error: 'No text found in PDF (it might be a scanned image)' };
      }

      log.info(`[PdfText] Formatting text with Ollama (${this.model})...`);
      const data = await this.mapTextToSchema(pdfData.text, jsonSchema);

      return {
        success: true,
        rawText: pdfData.text,
        data
      };
    } catch (e) {
      log.error(`[PdfText] Error: ${e.message}`, e);
      return { success: false, error: e.message || 'PdfText unknown error' };
    }
  }
}
