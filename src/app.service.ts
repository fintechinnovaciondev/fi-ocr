import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getSystemStatus() {
    return {
      status: 'online',
      service: 'SaaS OCR Multi-tenant API',
      version: '1.0.0',
      features: [
        'Multi-tenant Data Extraction',
        'Strategy Pattern OCR (Tesseract, Ollama)',
        'Resilient Processing with BullMQ',
        'Dynamic JSON Schema Validation',
        'Webhook Notifications',
        'Admin Dashboard API',
      ],
      endpoints: {
        ingesta: '/api/v1/ingesta',
        admin: '/admin/processes',
        auth: '/auth/google',
      },
    };
  }
}
