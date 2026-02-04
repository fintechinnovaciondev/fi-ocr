import { Controller, Post, Body, UseGuards, Request, UploadedFile, UseInterceptors, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as mime from 'mime-types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthGuard } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process, ProcessStatus } from '../schemas/process.schema';
import { DocumentTypeConfig } from '../schemas/document-type-config.schema';
import { OCR_QUEUE_NAME } from '../constants';
import { OcrService } from './ocr.service';
import { StorageService } from '../storage/storage.service';

@Controller('api/v1/ingesta')
export class OcrController {
  constructor(
    private ocrService: OcrService,
    private storageService: StorageService,
    @InjectQueue(OCR_QUEUE_NAME) private ocrQueue: Queue,
    @InjectModel(Process.name) private processModel: Model<Process>,
    @InjectModel(DocumentTypeConfig.name) private configModel: Model<DocumentTypeConfig>,
  ) {}

  @Post()
  @UseGuards(AuthGuard('api-key'))
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname) || (mime as any).extension(file.mimetype) || '.bin';
        cb(null, `api-${uniqueSuffix}${ext.startsWith('.') ? ext : '.' + ext}`);
      },
    }),
  }))
  async ingest(
    @Request() req,
    @Body('type') docTypeSlug: string,
    @Body('externalId') externalId: string,
    @Body('tags') tags: string | string[],
    @Body('sync') sync: string | boolean,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new NotFoundException('File not found in request');
    }

    const isSync = sync === 'true' || sync === true;
    const tenantId = req.user.tenantId;
    const apiKey = req.user.apiKey;

    // Validar existencia del tipo para ese tenantId
    const config = await this.configModel.findOne({ tenantId, slug: docTypeSlug });
    if (!config) {
      throw new NotFoundException(`Document type '${docTypeSlug}' not found for this tenant.`);
    }

    const tagList = Array.isArray(tags) ? tags : (tags ? tags.split(',') : []);

    // Subir archivo a la estrategia configurada
    const uploadedPath = await this.storageService.upload(file, file.path);

    // 1. Crear registro en DB
    const newProcess = new this.processModel({
      tenantId,
      externalId,
      documentType: docTypeSlug,
      tags: tagList,
      status: isSync ? ProcessStatus.PROCESSING : ProcessStatus.PENDING,
      apiKey,
      fileUrl: uploadedPath,
      storageType: this.storageService.getStorageType(),
    });

    await newProcess.save();

    if (isSync) {
      // Para procesos síncronos aseguramos path local (ya lo tenemos en file.path de multer)
      const ocrResult = await this.ocrService.processWithStack(
        file.path,
        config.strategyStack,
        config.jsonSchema,
        async (currentLogs) => {
          await this.processModel.updateOne({ _id: newProcess._id }, { logs: currentLogs });
        }
      );

      newProcess.logs = ocrResult.logs || '';
      if (ocrResult.success) {
        newProcess.status = ProcessStatus.COMPLETED;
        newProcess.extractedData = ocrResult.data;
        if (config.validationRules) {
          newProcess.validationResults = this.ocrService.validateData(ocrResult.data, config.validationRules);
        }
      } else {
        newProcess.status = ProcessStatus.FAILED;
        newProcess.errorMessage = ocrResult.error || 'Unknown error';
      }
      await newProcess.save();

      return {
        success: ocrResult.success,
        processId: newProcess._id,
        status: newProcess.status,
        data: newProcess.extractedData,
        validation: newProcess.validationResults,
        error: newProcess.errorMessage
      };
    } else {
      // PROCESAMIENTO ASÍNCRONO (COLAS)
      await this.ocrQueue.add('process-doc', {
        processId: newProcess._id,
        tenantId,
        docTypeSlug,
        fileUrl: newProcess.fileUrl,
      });

      return {
        success: true,
        processId: newProcess._id,
        status: ProcessStatus.PENDING,
      };
    }
  }
}
