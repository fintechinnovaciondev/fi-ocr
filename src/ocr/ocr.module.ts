import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { BullModule } from '@nestjs/bullmq';
import { OcrConsumer } from './ocr.consumer';
import { OcrController } from './ocr.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Process, ProcessSchema } from '../schemas/process.schema';
import { Tenant, TenantSchema } from '../schemas/tenant.schema';
import { DocumentTypeConfig, DocumentTypeConfigSchema } from '../schemas/document-type-config.schema';
import { OCR_QUEUE_NAME, OCR_QUEUE_PREFIX } from '../constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: OCR_QUEUE_NAME,
      prefix: OCR_QUEUE_PREFIX,
    }),
    MongooseModule.forFeature([
      { name: Process.name, schema: ProcessSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: DocumentTypeConfig.name, schema: DocumentTypeConfigSchema },
    ]),
  ],
  controllers: [OcrController],
  providers: [OcrService, OcrConsumer],
  exports: [OcrService, BullModule],
})
export class OcrModule {}
