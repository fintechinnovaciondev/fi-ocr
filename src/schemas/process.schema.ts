import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ProcessStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  VALIDATED = 'validated',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class Process extends Document {
  @Prop({ required: true })
  tenantId: string;

  @Prop({ required: true })
  externalId: string;

  @Prop({ required: true })
  documentType: string;

  @Prop({ enum: ProcessStatus, default: ProcessStatus.PENDING })
  status: ProcessStatus;

  @Prop()
  apiKey: string;

  @Prop({ type: Object })
  extractedData: any;

  @Prop({ type: Object })
  validationResults?: Record<string, Array<{
    success: boolean;
    message: string;
    ruleType: string;
  }>>;

  @Prop([String])
  tags: string[];

  @Prop()
  fileUrl: string;

  @Prop({ default: 'local' })
  storageType: string;

  @Prop()
  ocrProvider?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ default: '' })
  logs: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ProcessSchema = SchemaFactory.createForClass(Process);
ProcessSchema.index({ tenantId: 1, externalId: 1 });
ProcessSchema.index({ tags: 1 });
