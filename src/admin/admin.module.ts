import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Process, ProcessSchema } from '../schemas/process.schema';
import { Tenant, TenantSchema } from '../schemas/tenant.schema';
import { DocumentTypeConfig, DocumentTypeConfigSchema } from '../schemas/document-type-config.schema';
import { OCR_QUEUE_NAME, OCR_QUEUE_PREFIX } from '../constants';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [
    OcrModule,
    MongooseModule.forFeature([
      { name: Process.name, schema: ProcessSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: DocumentTypeConfig.name, schema: DocumentTypeConfigSchema },
    ]),
    BullModule.registerQueue({
      name: OCR_QUEUE_NAME,
      prefix: OCR_QUEUE_PREFIX,
    }),
  ],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
