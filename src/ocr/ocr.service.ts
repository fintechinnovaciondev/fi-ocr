import { Injectable } from '@nestjs/common';
import { TesseractStrategy } from './strategies/tesseract.strategy';
import { OllamaStrategy } from './strategies/ollama.strategy';
import { PdfTextStrategy } from './strategies/pdf-text.strategy';
import { PaddleOcrStrategy } from './strategies/paddle-ocr.strategy';
import { OcrProviderStrategy, OcrResult } from './strategies/ocr-provider.interface';
import * as mime from 'mime-types';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { defaultLogger as log } from '../common/fi-logger.config';

const execPromise = promisify(exec);
const pdfParse = require('pdf-parse');

@Injectable()
export class OcrService {
  private strategies: Map<string, OcrProviderStrategy> = new Map();

  constructor() {
    this.strategies.set('Tesseract', new TesseractStrategy());
    this.strategies.set('Ollama', new OllamaStrategy());
    this.strategies.set('PdfText', new PdfTextStrategy());
    this.strategies.set('PaddleOCR', new PaddleOcrStrategy());

    this.checkDependencies();
  }

  private async checkDependencies() {
    // Verificamos herramientas externas requeridas para procesamiento local.
    const tools = [
      { name: 'paddleocr', cmd: 'paddleocr -h' },
      { name: 'ghostscript', cmd: 'gs -version' }
    ];

    log.info('[OcrService] Verificando dependencias del sistema...');
    for (const tool of tools) {
      try {
        await execPromise(tool.cmd);
        log.info(`[OcrService] OK: ${tool.name} detectado.`);
      } catch (e) {
        log.warn(`[OcrService] ADVERTENCIA: ${tool.name} no está disponible en el PATH. Algunas funcionalidades de OCR local podrían fallar.`);
      }
    }
  }

  getAvailableStrategies() {
    return Array.from(this.strategies.values()).map(strategy => ({
      id: strategy.getName(),
      name: this.getFriendlyName(strategy.getName()),
      mimeTypes: strategy.getSupportedMimeTypes()
    }));
  }

  private getFriendlyName(id: string): string {
    const names: Record<string, string> = {
      'Tesseract': 'Tesseract (OCR Imágenes)',
      'PdfText': 'PDF Extracción (Texto Plano)',
      'Ollama': 'Ollama (LLM Visión/PDF)',
      'PaddleOCR': 'PaddleOCR (Multilingüe/Tablas)'
    };
    return names[id] || id;
  }

  getStrategy(name: string): OcrProviderStrategy | undefined {
    return this.strategies.get(name);
  }

  private async isSearchablePdf(filePath: string): Promise<boolean> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      // Consideramos "buscable" si tiene al menos 50 caracteres
      return data.text && data.text.trim().length > 50;
    } catch (e) {
      return false;
    }
  }

  private async convertPdfToImage(pdfPath: string): Promise<string> {
    const outPath = pdfPath.replace(/\.pdf$/i, '.jpg');
    try {
      // Intentamos con 'magick' (ImagenMagick 7)
      await execPromise(`magick -density 300 "${pdfPath}[0]" -quality 90 "${outPath}"`);
      return outPath;
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error('La conversión de PDF a Imagen requiere ImageMagick y una shell, no disponibles en este entorno (Distroless). Use Ollama o Tesseract directamente.');
      }
      // Fallback a 'convert' (ImageMagick 6 o legacy)
      try {
        await execPromise(`convert -density 300 "${pdfPath}[0]" -quality 90 "${outPath}"`);
        return outPath;
      } catch (e2) {
        throw new Error(`Error en conversión de PDF: ${e2.message}`);
      }
    }
  }

  async processWithStack(
    fileUrl: string, 
    stack: any[], 
    jsonSchema: any,
    onProgress?: (currentLogs: string) => Promise<void>
  ): Promise<OcrResult> {
    let lastResult: OcrResult = { success: false, error: 'No strategies defined' };
    let logsArr: string[] = [];
    
    const addLog = async (msg: string) => {
      const line = `[${new Date().toISOString()}] ${msg}`;
      logsArr.push(line);
      log.info(line);
      if (onProgress) {
        await onProgress(logsArr.join('\n'));
      }
    };

    let workingFile = fileUrl;
    const initialMime = mime.lookup(fileUrl) || 'application/octet-stream';
    await addLog(`Iniciando stack de procesamiento para: ${fileUrl} (${initialMime})`);

    // Lógica inteligente para PDFs
    if (initialMime === 'application/pdf') {
      const searchable = await this.isSearchablePdf(fileUrl);
      if (searchable) {
        await addLog(`PDF con texto plano detectado. Priorizando PdfTextStrategy.`);
        // Insertar PdfText al principio si no está
        const hasPdfText = stack.some(s => (typeof s === 'string' ? s : s.name) === 'PdfText');
        if (!hasPdfText) {
          stack.unshift('PdfText');
        }
      } else {
        await addLog(`PDF parece ser una imagen escaneada. Convirtiendo a imagen para OCR...`);
        try {
          workingFile = await this.convertPdfToImage(fileUrl);
          await addLog(`PDF convertido a: ${workingFile}`);
        } catch (err) {
          await addLog(`Error en conversión de PDF: ${err.message}. Continuando con el original.`);
        }
      }
    }

    const currentMime = mime.lookup(workingFile) || initialMime;

    for (const step of stack) {
      const strategyName = typeof step === 'string' ? step : step.name;
      const mimeTypes = typeof step === 'string' ? [] : (step.mimeTypes || []);

      if (mimeTypes && mimeTypes.length > 0 && !mimeTypes.includes(currentMime)) {
        await addLog(`Estrategia ${strategyName} omitida: tipo ${currentMime} no permitido.`);
        continue;
      }

      const strategy = this.getStrategy(strategyName);
      if (!strategy) {
        await addLog(`ADVERTENCIA: Estratégia NO ENCONTRADA: ${strategyName}`);
        continue;
      }

      await addLog(`Ejecutando ${strategyName}...`);
      try {
        const stepResult = await strategy.process(workingFile, jsonSchema);
        
        if (stepResult.success) {
          const previewText = stepResult.rawText ? stepResult.rawText.substring(0, 1000) : '';
          await addLog(`ÉXITO con ${strategyName}. Texto extraído: ${previewText}...`);
          return { 
            ...stepResult, 
            logs: logsArr.join('\n'),
            provider: strategyName 
          };
        }
        
        const errorDetail = stepResult.error;
        await addLog(`FALLO ${strategyName}: ${errorDetail}`);
        lastResult = { ...stepResult, logs: logsArr.join('\n') };
      } catch (err) {
        await addLog(`ERROR CRÍTICO en ${strategyName}: ${err.message}`);
        lastResult = { success: false, error: err.message, logs: logsArr.join('\n') };
      }
    }

    await addLog(`Stack terminado sin éxito.`);
    return lastResult;
  }

  validateData(data: any, rules: any): any {
    const results: Record<string, any[]> = {};
    if (!rules) return results;

    for (const [field, fieldRules] of Object.entries(rules)) {
      results[field] = (fieldRules as any[]).map(rule => {
        let success = true;
        const val = this.getValueByPath(data, field);

        try {
          switch (rule.ruleType) {
            case 'not_null':
              success = val !== null && val !== undefined && val !== '';
              break;
            case 'is_date':
              success = !isNaN(Date.parse(String(val)));
              break;
            case 'is_number':
              success = val !== '' && !isNaN(Number(String(val).replace(',', '.')));
              break;
            case 'comparison':
            case 'compare_number':
              success = this.checkComparison(val, rule, data);
              break;
            case 'compare_date':
              success = this.checkDateComparison(val, rule, data);
              break;
            case 'formula':
              success = this.checkFormula(val, rule, data);
              break;
            case 'regex':
              success = this.checkRegex(val, rule);
              break;
          }
        } catch (e) {
          success = false;
        }

        return {
          success,
          message: rule.message,
          ruleType: rule.ruleType
        };
      });
    }
    return results;
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  private checkComparison(val: any, rule: any, data: any): boolean {
    let target = rule.compareValue;
    if (rule.compareField) {
      target = this.getValueByPath(data, rule.compareField);
    } else if (target === 'today') {
      target = new Date().toISOString().split('T')[0];
    }

    const v = isNaN(Number(String(val).replace(',', '.'))) ? val : Number(String(val).replace(',', '.'));
    const t = isNaN(Number(String(target).replace(',', '.'))) ? target : Number(String(target).replace(',', '.'));

    switch (rule.operator) {
      case 'gt': return v > t;
      case 'lt': return v < t;
      case 'gte': return v >= t;
      case 'lte': return v <= t;
      case 'neq': return v !== t;
      default: return v == t;
    }
  }

  private checkDateComparison(val: any, rule: any, data: any): boolean {
    if (!val) return false;
    let targetDate = new Date();
    
    if (rule.compareField) {
      const fieldVal = this.getValueByPath(data, rule.compareField);
      if (!fieldVal) return false;
      targetDate = new Date(fieldVal);
    } else if (rule.compareValue && rule.compareValue !== 'today') {
      targetDate = new Date(rule.compareValue);
    }

    if (rule.offsetValue) {
      const offset = Number(rule.offsetValue);
      switch (rule.offsetUnit) {
        case 'days': targetDate.setDate(targetDate.getDate() + offset); break;
        case 'months': targetDate.setMonth(targetDate.getMonth() + offset); break;
        case 'years': targetDate.setFullYear(targetDate.getFullYear() + offset); break;
      }
    }

    const v = new Date(val).getTime();
    const t = targetDate.getTime();

    if (isNaN(v) || isNaN(t)) return false;

    switch (rule.operator) {
      case 'gt': return v > t;
      case 'lt': return v < t;
      case 'gte': return v >= t;
      case 'lte': return v <= t;
      case 'neq': return v !== t;
      default: return v == t;
    }
  }

  private checkRegex(val: any, rule: any): boolean {
    const sVal = String(val || '');
    if (rule.predefinedRegex === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sVal);
    }
    if (rule.predefinedRegex === 'phone') {
      return /^\+?[0-9]{7,15}$/.test(sVal);
    }
    if (rule.predefinedRegex === 'paraguay_ruc') {
      return /^[0-9]+-[0-9]$/.test(sVal);
    }
    if (rule.regex) {
      return new RegExp(rule.regex).test(sVal);
    }
    return true;
  }

  private checkFormula(val: any, rule: any, data: any): boolean {
    if (!rule.formula) return true;
    // Simple evaluator: replace fields with values
    let expr = rule.formula;
    const fields = expr.match(/[a-zA-Z_\.]+/g) || [];
    
    for (const field of fields) {
      const fieldVal = this.getValueByPath(data, field);
      if (fieldVal !== undefined) {
        expr = expr.replace(new RegExp(`\\b${field}\\b`, 'g'), String(Number(fieldVal) || 0));
      }
    }

    try {
      // Use Function constructor for a relatively safe restricted eval
      const result = new Function(`return ${expr}`)();
      return Math.abs(Number(val) - result) < 0.01; // tolerance for floats
    } catch (e) {
      return false;
    }
  }
}
