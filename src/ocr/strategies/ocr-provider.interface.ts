export interface OcrResult {
  success: boolean;
  data?: any;
  error?: string;
  rawText?: string;
  logs?: string;
  provider?: string;
}

export interface OcrProviderStrategy {
  getName(): string;
  getSupportedMimeTypes(): string[];
  process(fileUrl: string, jsonSchema: any): Promise<OcrResult>;
}
