import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Process } from '../schemas/process.schema';
import { Tenant } from '../schemas/tenant.schema';
import { DocumentTypeConfig } from '../schemas/document-type-config.schema';
import { createObjectCsvStringifier } from 'csv-writer';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OCR_QUEUE_NAME } from '../constants';
import { ProcessStatus } from '../schemas/process.schema';
import { OcrService } from '../ocr/ocr.service';
import { StorageService } from '../storage/storage.service';
import * as path from 'path';
import * as fs from 'fs';
import * as mime from 'mime-types';

// @ts-ignore
const Jimp = require('jimp');

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Process.name) private processModel: Model<Process>,
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    @InjectModel(DocumentTypeConfig.name) private configModel: Model<DocumentTypeConfig>,
    @InjectQueue(OCR_QUEUE_NAME) private ocrQueue: Queue,
    private ocrService: OcrService,
    private storageService: StorageService,
  ) {}

  getAvailableStrategies() {
    return this.ocrService.getAvailableStrategies();
  }

  async getDashboardStats() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [stats, timeSeriesData] = await Promise.all([
      this.processModel.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            completed: [{ $match: { status: 'completed' } }, { $count: 'count' }],
            validated: [{ $match: { status: 'validated' } }, { $count: 'count' }],
            pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
            failed: [{ $match: { status: 'failed' } }, { $count: 'count' }]
          }
        }
      ]),
      this.processModel.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              type: "$documentType"
            },
            count: { $sum: 1 },
            uniqueFolders: { $addToSet: "$externalId" }
          }
        },
        { $sort: { "_id.date": 1 } }
      ])
    ]);

    const s = stats[0];
    return {
      counters: {
        total: s.total[0]?.count || 0,
        completed: (s.completed[0]?.count || 0) + (s.validated[0]?.count || 0),
        pending: s.pending[0]?.count || 0,
        failed: s.failed[0]?.count || 0
      },
      timeSeries: timeSeriesData
    };
  }

  async getProcesses(filters: any) {
    const query: any = {};
    if (filters.tenantId) query.tenantId = filters.tenantId;
    if (filters.status) query.status = filters.status;
    if (filters.externalId) query.externalId = filters.externalId;
    if (filters.documentType) query.documentType = filters.documentType;
    if (filters.tags) query.tags = { $in: filters.tags.split(',') };
    if (filters.q) {
      query.$or = [
        { externalId: new RegExp(filters.q, 'i') },
        { tags: { $in: [new RegExp(filters.q, 'i')] } }
      ];
    }

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 25;
    const skip = (page - 1) * limit;
    
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [processes, total] = await Promise.all([
      this.processModel.find(query)
        .sort(sort as any)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.processModel.countDocuments(query).exec()
    ]);

    // Resolver URLs de storage para cada proceso
    const processesWithUrls = await Promise.all(
      processes.map(async (p) => {
        const obj = p.toObject();
        obj.fileUrl = `/api/admin/processes/${p._id}/image`;
        return obj;
      }),
    );

    return { data: processesWithUrls, total, page, limit };
  }

  async getProcessDetail(id: string, resolveUrl = false) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    const process = await this.processModel.findById(id).exec();
    if (!process) throw new NotFoundException('Process not found');

    const config = await this.configModel.findOne({ 
      tenantId: process.tenantId, 
      slug: process.documentType 
    }).exec();

    // Resolver URL para previsualización
    const processData = process.toObject();
    
    if (resolveUrl) {
      processData.fileUrl = await this.storageService.getUrl(process.fileUrl, process.storageType);
    } else {
      processData.fileUrl = `/api/admin/processes/${process._id}/image`;
    }

    return {
      process: processData,
      schema: config?.jsonSchema || {},
    };
  }

  async getProcessRecord(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return this.processModel.findById(id).exec();
  }

  async reprocess(id: string) {
    const process = await this.processModel.findById(id).exec();
    if (!process) throw new NotFoundException('Process not found');

    // Reset status
    process.status = ProcessStatus.PENDING;
    process.errorMessage = undefined;
    process.extractedData = undefined;
    await process.save();

    await this.ocrQueue.add('process-doc', {
      processId: process._id,
      tenantId: process.tenantId,
      docTypeSlug: process.documentType,
      fileUrl: process.fileUrl,
    });

    return { success: true };
  }

  async validateProcessData(id: string, extractedData: any) {
    const process = await this.processModel.findById(id).exec();
    if (!process) throw new NotFoundException('Process not found');

    const config = await this.configModel.findOne({ 
      tenantId: process.tenantId, 
      slug: process.documentType 
    }).exec();

    if (!config) throw new NotFoundException('Configuration not found for validation');

    const validationResults = this.ocrService.validateData(extractedData, config.validationRules);
    
    // Check if ALL validations passed
    let allPassed = true;
    for (const fieldResults of Object.values(validationResults)) {
      if ((fieldResults as any[]).some(r => !r.success)) {
        allPassed = false;
        break;
      }
    }

    process.extractedData = extractedData;
    process.validationResults = validationResults;
    process.status = allPassed ? ProcessStatus.VALIDATED : ProcessStatus.COMPLETED;
    
    await (process as any).save();

    return { success: true, validationResults, status: process.status };
  }

  async revertToCompleted(id: string) {
    const process = await this.processModel.findById(id).exec();
    if (!process) throw new NotFoundException('Process not found');
    
    if (process.status === ProcessStatus.VALIDATED) {
      process.status = ProcessStatus.COMPLETED;
      await (process as any).save();
    }
    return { success: true, status: process.status };
  }

  async updateProcessData(id: string, extractedData: any) {
    const process = await this.processModel.findById(id).exec();
    if (!process) throw new NotFoundException('Process not found');

    process.extractedData = extractedData;
    // Si se guardan cambios manuales y estaba VALIDATED, lo bajamos a COMPLETED
    if (process.status === ProcessStatus.VALIDATED) {
      process.status = ProcessStatus.COMPLETED;
    }
    
    await (process as any).save();
    return { success: true, status: process.status };
  }

  async rotateImage(id: string, degrees: number) {
    const process = await this.processModel.findById(id).exec();
    if (!process) throw new NotFoundException('Proceso no encontrado');

    const localPath = await this.storageService.getLocalPath(process.fileUrl, process.storageType);
    const absolutePath = path.resolve(localPath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException(`Archivo no encontrado en ${absolutePath}`);
    }

    try {
      const image = await Jimp.read(absolutePath);
      // Jimp rota en sentido horario (clockwise) con grados negativos.
      // Para que coincida con la intuición (90 = derecha, -90 = izquierda), invertimos el signo.
      await image.rotate(-degrees).writeAsync(absolutePath);
      
      // Volver a subir respetando el storageType original
      const newUrl = await this.storageService.upload({
          path: absolutePath,
          originalname: path.basename(absolutePath),
          mimetype: mime.lookup(absolutePath) || 'image/jpeg',
          size: fs.statSync(absolutePath).size,
          fieldname: 'file',
          encoding: '7bit'
      }, process.fileUrl, process.storageType);

      const logMsg = `[${new Date().toISOString()}] Imagen rotada ${degrees}° grados.`;
      process.logs = (process.logs || '') + '\n' + logMsg;
      process.fileUrl = newUrl;
      await (process as any).save();

      // Limpiar temporal SOLO si se descargó de cloud (localPath != process.fileUrl original)
      // Nota: process.fileUrl ya fue actualizado, así que comparamos con lo que acabamos de subir
      if (localPath !== newUrl && fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
        } catch (e) {
          console.error(`Error eliminando temporal en rotación: ${localPath}`, e);
        }
      }

      return { success: true, message: 'Imagen rotada exitosamente' };
    } catch (e) {
      console.error('Error rotando imagen:', e);
      throw new BadRequestException(`Error al rotar imagen: ${e.message}. Asegúrese de tener 'jimp' instalado.`);
    }
  }

  async getFolderAggregation(query: any, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      { $match: query },
      {
        $group: {
          _id: "$externalId",
          externalId: { $first: "$externalId" },
          tenantId: { $first: "$tenantId" },
          count: { $sum: 1 },
          lastUpdate: { $max: "$createdAt" },
          statuses: { $push: "$status" }
        }
      },
      { $sort: { lastUpdate: -1 } }
    ];

    const [results, totalCount] = await Promise.all([
      this.processModel.aggregate([
        ...pipeline,
        { $skip: skip },
        { $limit: limit }
      ]),
      this.processModel.aggregate([
        ...pipeline,
        { $count: "total" }
      ])
    ]);

    const data = results.map(folder => {
      let status = 'completed';
      if (folder.statuses.includes('failed')) status = 'failed';
      else if (folder.statuses.includes('pending')) status = 'pending';
      else if (folder.statuses.includes('validated') && !folder.statuses.includes('completed')) status = 'validated';
      
      return {
        ...folder,
        status,
        updatedAt: folder.lastUpdate
      };
    });

    return {
      data,
      total: totalCount[0]?.total || 0,
      page,
      limit
    };
  }

  async createProcess(data: any) {
    const newProcess = new this.processModel({
      ...data,
      status: 'pending',
    });
    const saved = await newProcess.save();
    return saved._id;
  }

  async getLinkedNodes(tenantId: string, externalId: string) {
    // Agrupa documentos que compartan el mismo externalId
    return this.processModel.find({ tenantId, externalId }).exec();
  }

  async exportToCsv(filters: any) {
    const { data } = await this.getProcesses({ ...filters, limit: 5000 });
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'externalId', title: 'External ID' },
        { id: 'status', title: 'Status' },
        { id: 'documentType', title: 'Type' },
        { id: 'createdAt', title: 'Date' },
      ]
    });

    return csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);
  }

  async updateTenantConfig(tenantId: string, update: any) {
    return this.tenantModel.findOneAndUpdate({ tenantId }, update, { new: true });
  }

  // --- Métodos para Tenants (CRUD) ---

  async getTenants() {
    return this.tenantModel.find().exec();
  }

  async getTenantById(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    const tenant = await this.tenantModel.findById(id).exec();
    if (!tenant) throw new NotFoundException('Inquilino no encontrado');
    return tenant;
  }

  async createTenant(data: any) {
    return new this.tenantModel(data).save();
  }

  async updateTenant(id: string, data: any) {
    const tenant = await this.tenantModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!tenant) throw new NotFoundException('Inquilino no encontrado');
    return tenant;
  }

  async deleteTenant(id: string) {
    const result = await this.tenantModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Inquilino no encontrado');
    return result;
  }

  // --- Métodos para DocumentTypeConfig (CRUD) ---

  async getConfigs(filters: any = {}) {
    return this.configModel.find(filters).exec();
  }

  async getConfigById(id: string) {
    if (!isValidObjectId(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    const config = await this.configModel.findById(id).exec();
    if (!config) throw new NotFoundException('Configuración no encontrada');
    return config;
  }

  async createConfig(data: any) {
    return new this.configModel(data).save();
  }

  async updateConfig(id: string, data: any) {
    const config = await this.configModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!config) throw new NotFoundException('Configuración no encontrada');
    return config;
  }

  async deleteConfig(id: string) {
    const result = await this.configModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Configuración no encontrada');
    return result;
  }
}
