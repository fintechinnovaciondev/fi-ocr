import { OcrProviderStrategy, OcrResult } from './ocr-provider.interface';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseExtractor } from './base-extractor.strategy';
import { defaultLogger as log } from '../../common/fi-logger.config';

const execPromise = promisify(exec);

export class PaddleOcrStrategy extends BaseExtractor implements OcrProviderStrategy {
  getName(): string {
    return 'PaddleOCR';
  }

  getSupportedMimeTypes(): string[] {
    return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
  }

  async process(fileUrl: string, jsonSchema: any): Promise<OcrResult> {
    try {
      log.info(`[PaddleOCR] Processing path: ${fileUrl}`);
      
      // Ejecución real de PaddleOCR vía CLI
      // Se requiere el subcomando 'ocr' y el parámetro -i (input)
      // Desactivamos mkldnn para evitar errores de OneDNN en arquitecturas CPU específicas
      const command = `paddleocr ocr -i "${fileUrl}" --use_angle_cls true --lang es --enable_mkldnn false`;
      
      const { stdout, stderr } = await execPromise(command, {
        env: { 
          ...process.env, 
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
          // Desactivamos optimizaciones OneDNN que fallan en ciertos contenedores
          FLAGS_use_mkldnn: '0',
          FLAGS_use_onednn: '0',
          // Ignoramos advertencias de deprecación de Python para limpiar la salida
          PYTHONWARNINGS: 'ignore'
        }
      });

      // PaddleOCR imprime un objeto tipo diccionario de Python en stdout.
      // Necesitamos extraer los textos del array 'rec_texts' usando un poco de post-procesamiento.
      let text = stdout;
      
      try {
        // Buscamos el patrón de rec_texts: 'rec_texts': ['...', '...']
        const recTextsMatch = stdout.match(/'rec_texts':\s*\[(.*?)\]/s);
        if (recTextsMatch && recTextsMatch[1]) {
          // Extraemos los elementos, quitamos las comillas y unimos por saltos de línea
          text = recTextsMatch[1]
            .split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .join('\n');
          
          log.info(`[PaddleOCR] Parsed texts from rec_texts array. Length: ${text.length}`);
        } else {
          log.warn(`[PaddleOCR] Could not find 'rec_texts' pattern in stdout. Using raw output.`);
        }
      } catch (e) {
        log.warn(`[PaddleOCR] Error parsing stdout: ${e.message}. Using raw output.`);
      }

      if (stderr) {
        log.debug(`[PaddleOCR] CLI Stderr: ${stderr}`);
      }

      log.info(`[PaddleOCR] Text to LLM: ${text.substring(0, 200)}...`);

      const data = await this.mapTextToSchema(text, jsonSchema);

      return {
        success: true,
        rawText: text,
        data
      };
    } catch (e) {
      log.error(`[PaddleOCR] Error: ${e.message}`, e);
      // Devolveré error para que se vea si falta la dependencia.
      return { success: false, error: `PaddleOCR failed: ${e.message}` };
    }
  }
}
