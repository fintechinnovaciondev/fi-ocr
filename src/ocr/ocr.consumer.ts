import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process, ProcessStatus } from '../schemas/process.schema';
import { Tenant } from '../schemas/tenant.schema';
import { DocumentTypeConfig } from '../schemas/document-type-config.schema';
import axios from 'axios';
import * as fs from 'fs';
import { OCR_QUEUE_NAME } from '../constants';
import { StorageService } from '../storage/storage.service';
import { defaultLogger as log } from '../common/fi-logger.config';

@Processor(OCR_QUEUE_NAME)
@Injectable()
export class OcrConsumer extends WorkerHost {
  constructor(
    private ocrService: OcrService,
    private storageService: StorageService,
    @InjectModel(Process.name) private processModel: Model<Process>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    @InjectModel(DocumentTypeConfig.name) private configModel: Model<DocumentTypeConfig>,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { processId, tenantId, docTypeSlug, fileUrl } = job.data;
    log.info(`[Job] Processing OCR for processId: ${processId} (${docTypeSlug})`);

    const processDoc = await this.processModel.findById(processId);
    if (!processDoc) {
      log.warn(`[Job] Process document not found: ${processId}`);
      return;
    }

    processDoc.status = ProcessStatus.PROCESSING;
    await processDoc.save();

    const config = await this.configModel.findOne({ tenantId, slug: docTypeSlug });
    if (!config) {
      processDoc.status = ProcessStatus.FAILED;
      processDoc.errorMessage = 'Config not found';
      await processDoc.save();
      log.error(`[Job] Config not found for tenant: ${tenantId}, slug: ${docTypeSlug}`);
      return;
    }

    // Asegurar que el archivo esté disponible localmente (descargarlo si es necesario)
    const localPath = await this.storageService.getLocalPath(fileUrl, processDoc.storageType);

    const ocrResult = await this.ocrService.processWithStack(
      localPath, 
      config.strategyStack, 
      config.jsonSchema,
      async (currentLogs) => {
        await this.processModel.updateOne({ _id: processId }, { logs: currentLogs });
      }
    );

    processDoc.logs = ocrResult.logs || '';
    if (ocrResult.success) {
      processDoc.status = ProcessStatus.COMPLETED;
      processDoc.extractedData = ocrResult.data;
      processDoc.ocrProvider = ocrResult.provider || 'unknown'; // Guardar el proveedor que tuvo éxito
      log.info(`[Job] OCR successful for processId: ${processId} with provider: ${processDoc.ocrProvider}`);
      
      // Validaciones dinámicas
      if (config.validationRules) {
        processDoc.validationResults = this.ocrService.validateData(ocrResult.data, config.validationRules);
      }
    } else {
      processDoc.status = ProcessStatus.FAILED;
      processDoc.errorMessage = ocrResult.error || 'Unknown error';
      log.error(`[Job] OCR failed for processId: ${processId}: ${processDoc.errorMessage}`);
    }
    await processDoc.save();

    // Limpieza de archivos temporales (si se descargaron de cloud)
    if (fileUrl !== localPath && fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch (err) {
        log.error(`[Job] Error eliminando temporal ${localPath}: ${err.message}`);
      }
    }

    // Webhook Notification
    await this.notifyWebhook(tenantId, config, processDoc);

    return ocrResult;
  }

  private async notifyWebhook(tenantId: string, config: any, processDoc: any) {
    const tenant = await this.tenantModel.findOne({ tenantId });
    if (!tenant) return;

    // Buscar la configuración específica de la API Key usada
    const apiKeyConfig = tenant.apiKeys?.find(ak => ak.key === processDoc.apiKey);
    
    // Determinar si el webhook está habilitado
    // Si hay config de API Key, manda su estado. Si no, manda el estado global del tenant.
    const isEnabled = apiKeyConfig ? (apiKeyConfig.webhookEnabled !== false) : (tenant.webhookEnabled !== false);
    
    if (!isEnabled) {
      log.info(`[Webhook] Notificaciones desactivadas para el tenant ${tenantId} (${processDoc.apiKey || 'Global'})`);
      return;
    }

    // Prioridad de URL: 1. Override en el tipo de doc, 2. URL específica de la API Key, 3. URL global del Tenant
    const webhookUrl = config.webhookOverride || apiKeyConfig?.webhookUrl || tenant.webhookUrl;

    if (webhookUrl) {
      const headers: any = {};
      const auth = apiKeyConfig?.webhookAuth;

      if (auth && auth.type !== 'none') {
        if (auth.type === 'header' && auth.headerName) {
          headers[auth.headerName] = auth.token;
        } else if (auth.type === 'bearer' && auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        } else if (auth.type === 'basic' && auth.username) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
      }

      try {
        await axios.post(webhookUrl, {
          id: processDoc._id,
          externalId: processDoc.externalId,
          status: processDoc.status,
          documentType: processDoc.documentType,
          extractedData: processDoc.extractedData,
          tags: processDoc.tags,
          error: processDoc.errorMessage
        }, { headers });
        log.info(`[Webhook] Sent to ${webhookUrl} for processId: ${processDoc._id}`);
      } catch (e) {
        log.error(`[Webhook] Failed for tenant ${tenantId} (Key: ${apiKeyConfig?.label || 'unknown'}): ${e.message}`);
      }
    }
  }
}
