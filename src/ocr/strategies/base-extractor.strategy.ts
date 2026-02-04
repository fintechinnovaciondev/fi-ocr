import axios from 'axios';
import { defaultLogger as log } from '../../common/fi-logger.config';

export abstract class BaseExtractor {
  protected ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
  protected model = process.env.OLLAMA_MODEL || 'llama3';
  protected timeout = parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);

  /**
   * Envía texto plano a Ollama para extraer datos estructurados según un esquema JSON.
   */
  async mapTextToSchema(text: string, jsonSchema: any): Promise<any> {
    try {
      const prompt = `
        A continuación se presenta un texto extraído mediante OCR. 
        Tu tarea es extraer la información relevante y devolverla estrictamente en formato JSON siguiendo este esquema:
        ${JSON.stringify(jsonSchema, null, 2)}

        Reglas:
        1. Responde ÚNICAMENTE con el objeto JSON.
        2. Si no encuentras un dato, usa null o una cadena vacía según corresponda.
        3. El texto está en español, asegúrate de interpretar correctamente fechas y montos.

        Texto extraído:
        """
        ${text}
        """
      `;

      const response = await axios.post(this.ollamaUrl, {
        model: this.model,
        prompt: prompt,
        stream: false,
        format: 'json'
      }, { timeout: this.timeout });

      return JSON.parse(response.data.response);
    } catch (e) {
      log.error(`[BaseExtractor] Error mapping text to schema: ${e.message}`, e);
      throw new Error(`Error al procesar el texto con el LLM: ${e.message}`);
    }
  }
}
