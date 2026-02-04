import { OcrProviderStrategy, OcrResult } from './ocr-provider.interface';
import * as Tesseract from 'tesseract.js';
import { BaseExtractor } from './base-extractor.strategy';
import { defaultLogger as log } from '../../common/fi-logger.config';

export class TesseractStrategy extends BaseExtractor implements OcrProviderStrategy {
  getName(): string {
    return 'Tesseract';
  }

  getSupportedMimeTypes(): string[] {
    return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  }

  async process(fileUrl: string, jsonSchema: any): Promise<OcrResult> {
    try {
      log.info(`[Tesseract] Recognizing path: ${fileUrl}`);
      const { data: { text } } = await Tesseract.recognize(fileUrl, 'spa+eng');
      
      const data = await this.mapTextToSchema(text, jsonSchema);

      return {
        success: true,
        rawText: text,
        data
      };
    } catch (e) {
      log.error(`[Tesseract] Error: ${e.message}`, e);
      return { success: false, error: e.message || 'Tesseract unknown error' };
    }
  }
}
