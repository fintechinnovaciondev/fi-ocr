import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class DocumentTypeConfig extends Document {
  @Prop({ required: true })
  tenantId: string;

  @Prop({ required: true })
  slug: string; // e.g., 'factura-servicio'

  @Prop({ type: Object, required: true })
  jsonSchema: any;

  @Prop({ type: Object })
  validationRules?: Record<string, Array<{
    ruleType: 'comparison' | 'formula' | 'not_null' | 'regex' | 'is_date' | 'is_number' | 'compare_date' | 'compare_number';
    operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'neq';
    compareValue?: any; // can be 'today', a date string, or a number
    compareField?: string;
    offsetValue?: number;
    offsetUnit?: 'days' | 'months' | 'years';
    formula?: string;
    regex?: string;
    predefinedRegex?: 'email' | 'phone' | 'paraguay_ruc' | 'custom';
    message: string;
  }>>;

  @Prop({
    type: [{
      name: { type: String, required: true },
      mimeTypes: [String] // e.g., ['image/png', 'application/pdf']
    }],
    _id: false
  })
  strategyStack: { name: string; mimeTypes: string[] }[];

  @Prop()
  webhookOverride: string;
}

export const DocumentTypeConfigSchema = SchemaFactory.createForClass(DocumentTypeConfig);
DocumentTypeConfigSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
