import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from '../schemas/tenant.schema';

@Injectable()
export class TenantService {
  constructor(@InjectModel(Tenant.name) private tenantModel: Model<Tenant>) {}

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    return this.tenantModel.findOne({ 'apiKeys.key': apiKey }).exec();
  }

  async findById(tenantId: string): Promise<Tenant | null> {
    return this.tenantModel.findOne({ tenantId }).exec();
  }
}
