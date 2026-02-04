import { OcrProviderStrategy, OcrResult } from './ocr-provider.interface';
import axios from 'axios';
import * as fs from 'fs';
import * as mime from 'mime-types';
import { defaultLogger as log } from '../../common/fi-logger.config';

export class OllamaStrategy implements OcrProviderStrategy {
  private ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
  private model = process.env.OLLAMA_MODEL || 'llama3';
  private timeout = parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);

  getName(): string {
    return 'Ollama';
  }

  getSupportedMimeTypes(): string[] {
    return ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  }

  async process(fileUrl: string, jsonSchema: any): Promise<OcrResult> {
    try {
      log.info(`[Ollama] Sending request to ${this.ollamaUrl} (Model: ${this.model}, Timeout: ${this.timeout}ms)`);
      
      const detectedMime = mime.lookup(fileUrl) || '';
      const isImage = detectedMime.startsWith('image/');
      
      const prompt = `
        Analiza esta imagen y extrae la información relevante siguiendo estrictamente este esquema JSON:
        ${JSON.stringify(jsonSchema, null, 2)}

        Reglas:
        1. Responde ÚNICAMENTE con el objeto JSON.
        2. Si no encuentras un dato, usa null o una cadena vacía.
        3. El documento está en español, interpreta correctamente fechas y montos.
      `;

      const payload: any = {
        model: this.model,
        prompt: prompt,
        stream: false,
        format: 'json'
      };

      if (isImage) {
        const imageBase64 = fs.readFileSync(fileUrl).toString('base64');
        payload.images = [imageBase64];
      } else {
        return { success: false, error: 'Ollama Vision no soporta archivos PDF directamente sin conversión previa a imágenes.' };
      }

      const response = await axios.post(this.ollamaUrl, payload, { timeout: this.timeout });
      const rawResponse = response.data.response;

      try {
        return {
          success: true,
          data: JSON.parse(rawResponse)
        };
      } catch (parseError) {
        log.error(`[Ollama] JSON Parse Error. Raw response: ${rawResponse}`, parseError);
        return { 
          success: false, 
          error: `JSON Incompleto o malformado retornado por Ollama: ${parseError.message}. Respuesta parcial: ${rawResponse.substring(0, 100)}...` 
        };
      }
    } catch (e) {
      const errorMsg = e.response?.data?.error || e.message;
      log.error(`[Ollama] Error: ${errorMsg}`, e);
      return { success: false, error: errorMsg };
    }
  }
}
