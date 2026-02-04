import { Controller, Get, Query, UseGuards, Res, Body, Patch, Param, Post, Delete, UploadedFile, UseInterceptors, BadRequestException, NotFoundException, Sse, MessageEvent } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as mime from 'mime-types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AdminService } from './admin.service';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { OCR_QUEUE_NAME } from '../constants';
import { interval, map, switchMap, from, distinctUntilChanged, Observable } from 'rxjs';
import { StorageService } from '../storage/storage.service';
import * as path from 'path';
import * as fs from 'fs';
import { defaultLogger } from '../common/fi-logger.config';

@Controller('api/admin')
// @UseGuards(AuthGuard('google')) // Comentado temporalmente para permitir ingesta manual sin fallos de redirección en fetch
export class AdminController {
  constructor(
    private adminService: AdminService,
    private storageService: StorageService,
    @InjectQueue(OCR_QUEUE_NAME) private ocrQueue: Queue,
  ) {}

  @Get('processes')
  async list(@Query() filters: any, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info('Listing processes with filters', filters);
    return this.adminService.getProcesses(filters);
  }

  @Get('processes/:id')
  async detail(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Fetching detail for process: ${id}`);
    return this.adminService.getProcessDetail(id);
  }

  @Get('processes/:id/image')
  async getProcessImage(@Param('id') id: string, @Res() res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Serving image for process: ${id}`);
    
    // Obtenemos el registro bruto de la base de datos
    const processDoc = await this.adminService.getProcessRecord(id);
    if (!processDoc) throw new NotFoundException('Process not found');

    const storageType = processDoc.storageType || 'local';
    const remotePath = processDoc.fileUrl;

    // 1. Verificamos si el archivo ya existe localmente en 'uploads'
    const fileName = remotePath.split('/').pop() || 'file';
    const localPath = path.join('uploads', fileName);
    const absolutePath = path.resolve(process.cwd(), localPath);

    if (fs.existsSync(absolutePath)) {
      log.debug(`Serving file from local storage: ${localPath}`);
      return res.sendFile(absolutePath);
    }

    // 2. Si no es local y no existe, lo descargamos (implementando una cache local)
    if (storageType !== 'local') {
      log.info(`File not found locally. Downloading from ${storageType}: ${remotePath}`);
      try {
        const downloadedPath = await this.storageService.getLocalPath(remotePath, storageType);
        const absoluteDownloadedPath = path.resolve(process.cwd(), downloadedPath);
        
        // Si el path descargado no coincide con nuestro localPath (ej: prefijo tmp-), lo renombramos
        if (absoluteDownloadedPath !== absolutePath) {
          if (!fs.existsSync(path.dirname(absolutePath))) {
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
          }
          // Si el destino ya existe (por una descarga simultánea), borramos el temporal
          if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absoluteDownloadedPath);
          } else {
            fs.renameSync(absoluteDownloadedPath, absolutePath);
          }
        }
        
        return res.sendFile(absolutePath);
      } catch (err) {
        log.error(`Error downloading from storage: ${err.message}`);
        // Fallback: Redirigimos a la URL firmada directamente si falla la descarga local
        try {
          const signedUrl = await this.storageService.getUrl(remotePath, storageType);
          if (signedUrl.startsWith('http')) {
            return res.redirect(signedUrl);
          }
        } catch (e) {
          log.error(`Fallback failed: ${e.message}`);
        }
      }
    }
    
    throw new NotFoundException('Archivo no encontrado localmente ni se pudo recuperar de la nube');
  }

  @Sse('processes/:id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return interval(2000).pipe(
      switchMap(() => from(this.adminService.getProcessDetail(id))),
      map((detail: any) => ({
        data: { 
          status: detail.process.status, 
          extractedData: detail.process.extractedData,
          logs: detail.process.logs || ''
        }
      } as MessageEvent)),
    );
  }

  @Post('processes/:id/reprocess')
  async reprocess(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Reprocessing document: ${id}`);
    return this.adminService.reprocess(id);
  }

  @Post('processes/:id/validate')
  async validate(@Param('id') id: string, @Body() body: any, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Validating data for document: ${id}`);
    return this.adminService.validateProcessData(id, body);
  }

  @Post('processes/:id/revert-to-completed')
  async revertToCompleted(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Reverting status to completed for document: ${id}`);
    return this.adminService.revertToCompleted(id);
  }

  @Post('processes/:id/update-data')
  async updateData(@Param('id') id: string, @Body() body: any, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Updating extracted data for document: ${id}`);
    return this.adminService.updateProcessData(id, body);
  }

  @Post('processes/:id/rotate')
  async rotate(@Param('id') id: string, @Body('degrees') degrees: number, @Res({ passthrough: true }) res: Response) {
    const log = (res as any).locals?.log || defaultLogger;
    log.info(`Rotating image for document: ${id} by ${degrees} degrees`);
    return this.adminService.rotateImage(id, degrees);
  }

  @Get('linked-nodes/:tenantId/:externalId')
  async nodes(@Param('tenantId') tid: string, @Param('externalId') eid: string) {
    return this.adminService.getLinkedNodes(tid, eid);
  }

  @Get('export')
  async export(@Query() filters: any, @Res() res: Response) {
    const csv = await this.adminService.exportToCsv(filters);
    res.header('Content-Type', 'text/csv');
    res.attachment('report.csv');
    return res.send(csv);
  }

  @Patch('tenants/:tenantId')
  async updateTenantConfig(@Param('tenantId') tid: string, @Body() body: any) {
    return this.adminService.updateTenantConfig(tid, body);
  }

  // --- Endpoints para Tenants ---

  @Get('tenants-list')
  async listTenants() {
    return this.adminService.getTenants();
  }

  @Post('tenants')
  async createTenant(@Body() body: any) {
    return this.adminService.createTenant(body);
  }

  @Patch('tenants-crud/:id')
  async updateTenant(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateTenant(id, body);
  }

  @Delete('tenants-crud/:id')
  async deleteTenant(@Param('id') id: string) {
    return this.adminService.deleteTenant(id);
  }

  // --- Endpoints para DocumentTypeConfig ---

  @Get('configs')
  async listConfigs(@Query() filters: any) {
    return this.adminService.getConfigs(filters);
  }

  @Post('configs')
  async createConfig(@Body() body: any) {
    return this.adminService.createConfig(body);
  }

  @Patch('configs/:id')
  async updateConfig(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateConfig(id, body);
  }

  @Delete('configs/:id')
  async deleteConfig(@Param('id') id: string) {
    return this.adminService.deleteConfig(id);
  }

  // --- Ingesta Manual (Admin) ---

  @Post('ingesta')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname) || (mime as any).extension(file.mimetype) || '.bin';
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext.startsWith('.') ? ext : '.' + ext}`);
      },
    }),
  }))
  async manualIngest(
    @Body() body: any,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo para procesar');
    }
    const { tenantId, type: docTypeSlug, externalId, tags } = body;
    
    // Subir archivo a la estrategia configurada
    const uploadedPath = await this.storageService.upload(file, file.path);

    // El admin puede procesar sin API Key, usamos una marca de sistema
    const processId = await this.adminService.createProcess({
      tenantId,
      documentType: docTypeSlug,
      externalId,
      tags: tags ? tags.split(',') : [],
      fileUrl: uploadedPath,
      apiKey: 'ADMIN_MANUAL_TEST'
    });

    await this.ocrQueue.add('process-doc', {
      processId,
      tenantId,
      docTypeSlug,
      fileUrl: uploadedPath,
    });

    return { success: true, processId };
  }
}
