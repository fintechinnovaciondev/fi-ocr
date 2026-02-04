import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
class WebhookAuth {
  @Prop({ enum: ['none', 'header', 'basic', 'bearer'], default: 'none' })
  type: string;

  @Prop()
  headerName?: string;

  @Prop()
  token?: string;

  @Prop()
  username?: string;

  @Prop()
  password?: string;
}

@Schema({ _id: false })
class ApiKeyConfig {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop()
  webhookUrl?: string;

  @Prop({ default: true })
  webhookEnabled: boolean;

  @Prop({ type: WebhookAuth })
  webhookAuth?: WebhookAuth;
}

@Schema({ timestamps: true })
export class Tenant extends Document {
  @Prop({ required: true, unique: true })
  tenantId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: [ApiKeyConfig], default: [] })
  apiKeys: ApiKeyConfig[];

  @Prop()
  webhookUrl: string;

  @Prop({ default: true })
  webhookEnabled: boolean;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
