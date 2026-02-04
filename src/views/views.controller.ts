import { Controller, Get, Render, UseGuards, Param, Query, Req, Res } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../schemas/user.schema';
import type { Response } from 'express';
import * as path from 'path';

@Controller('admin')
export class ViewsController {
  constructor(
    private adminService: AdminService,
    private authService: AuthService,
  ) {}

  @Get('login')
  login(@Req() req, @Res() res) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.redirect('/admin');
    }
    return res.render('login', { layout: false });
  }

  @Get()
  @UseGuards(SessionGuard)
  @Render('dashboard')
  async dashboard(@Req() req) {
    const [statsResult, { data: recentProcesses }] = await Promise.all([
      this.adminService.getDashboardStats(),
      this.adminService.getProcesses({ 
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      })
    ]);
    
    return {
      title: 'Panel General',
      currentPath: '/admin',
      user: req.user,
      stats: statsResult.counters,
      chartData: statsResult.timeSeries,
      recentProcesses,
    };
  }

  @Get('search')
  @UseGuards(SessionGuard)
  @Render('search')
  async search(@Query() filters: any, @Req() req) {
    const result = await this.adminService.getProcesses(filters);
    const tenants = await this.adminService.getTenants();
    const configs = await this.adminService.getConfigs();

    return {
      title: 'Búsqueda de Documentos',
      currentPath: '/admin/search',
      user: req.user,
      processes: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.total / result.limit),
      filters,
      tenants,
      configs
    };
  }

  @Get('folders')
  @UseGuards(SessionGuard)
  @Render('folders')
  async folders(@Query() filters: any, @Req() req) {
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 12;
    // const skip = (page - 1) * limit; // Borrado por no usarse aquí si el service lo maneja

    const query: any = {};
    if (filters.q) {
      query.externalId = new RegExp(filters.q, 'i');
    }

    const folderStats = await this.adminService.getFolderAggregation(query, page, limit);

    return {
      title: 'Gestión por Carpetas',
      currentPath: '/admin/folders',
      user: req.user,
      folders: folderStats.data,
      total: folderStats.total,
      page: folderStats.page,
      limit: folderStats.limit,
      pages: Math.ceil(folderStats.total / folderStats.limit),
      filters
    };
  }

  @Get('ingesta')
  @UseGuards(SessionGuard)
  @Render('ingesta')
  async ingestaView(@Req() req) {
    const [tenants, configs] = await Promise.all([
      this.adminService.getTenants(),
      this.adminService.getConfigs(),
    ]);
    return {
      title: 'Nueva Ingesta de Documento',
      user: req.user,
      tenants,
      configs,
    };
  }

  @Get('users')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Render('users')
  async usersView(@Req() req) {
    const users = await this.authService.getAllUsers();
    return {
      title: 'Administración de Usuarios',
      currentPath: '/admin/users',
      user: req.user,
      users,
      roles: Object.values(UserRole),
    };
  }

  @Get('processes/:id')
  @UseGuards(SessionGuard)
  @Render('detail')
  async detail(@Param('id') id: string, @Req() req) {
    const { process, schema } = await this.adminService.getProcessDetail(id);
    
    const extractionData = process.extractedData || {};
    
    return {
      title: `Detalle: ${process.externalId}`,
      user: req.user,
      process,
      extractionData,
      rawJson: JSON.stringify(extractionData, null, 2),
    };
  }

  @Get('processes/:id/image')
  @UseGuards(SessionGuard)
  async getProcessImage(@Param('id') id: string, @Res() res: Response) {
    const { process: processDoc } = await this.adminService.getProcessDetail(id, true);
    const url = processDoc.fileUrl;

    if (url.startsWith('http')) {
      return res.redirect(url);
    }
    
    const relativePath = url.startsWith('/') ? url.substring(1) : url;
    const absolutePath = path.resolve(process.cwd(), relativePath);
    
    return res.sendFile(absolutePath);
  }

  // --- Vistas para Tenants ---

  @Get('tenants')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Render('tenants-list')
  async listTenants(@Req() req) {
    const tenants = await this.adminService.getTenants();
    return {
      title: 'Clientes (Tenants)',
      currentPath: '/admin/tenants',
      user: req.user,
      tenants,
    };
  }

  @Get('tenants/new')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Render('tenants-edit')
  async createTenantView(@Req() req) {
    return {
      title: 'Nuevo Cliente',
      currentPath: '/admin/tenants',
      user: req.user,
      isNew: true,
      tenant: { apiKeys: [''] }
    };
  }

  @Get('tenants/:id')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Render('tenants-edit')
  async editTenantView(@Param('id') id: string, @Req() req) {
    const tenant = await this.adminService.getTenantById(id);
    return {
      title: 'Editar Cliente',
      currentPath: '/admin/tenants',
      user: req.user,
      isNew: false,
      tenant: tenant.toObject()
    };
  }

  @Get('configs')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Render('configs-list')
  async listConfigs(@Req() req) {
    const configs = await this.adminService.getConfigs();
    return {
      title: 'Configuraciones de Documentos',
      currentPath: '/admin/configs',
      user: req.user,
      configs,
    };
  }

  @Get('configs/new')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Render('configs-edit')
  async createConfigView(@Req() req) {
    const tenants = await this.adminService.getTenants();
    return {
      title: 'Nueva Configuración',
      currentPath: '/admin/configs',
      user: req.user,
      isNew: true,
      tenants,
      strategies: this.adminService.getAvailableStrategies(),
      config: {
        primaryStrategy: 'Tesseract',
        fallbackStrategy: 'Ollama',
        jsonSchema: JSON.stringify({
          tipo: "string",
          monto: "number",
          fecha: "string"
        }, null, 2)
      }
    };
  }

  @Get('configs/:id')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Render('configs-edit')
  async editConfigView(@Param('id') id: string, @Req() req) {
    const [config, tenants] = await Promise.all([
      this.adminService.getConfigById(id),
      this.adminService.getTenants()
    ]);
    return {
      title: 'Editar Configuración',
      currentPath: '/admin/configs',
      user: req.user,
      isNew: false,
      tenants,
      strategies: this.adminService.getAvailableStrategies(),
      config: {
        ...config.toObject(),
        primaryStrategy: config.strategyStack[0]?.name || config.strategyStack[0] || 'Tesseract',
        fallbackStrategy: config.strategyStack[1]?.name || config.strategyStack[1] || '',
        jsonSchema: JSON.stringify(config.jsonSchema, null, 2),
        validationRulesJson: JSON.stringify(config.validationRules || {}, null, 2)
      }
    };
  }

  // --- Vista de Administración de Usuarios ---

  @Get('users')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Render('users')
  async listUsers(@Req() req) {
    const users = await this.authService.getAllUsers();
    return {
      title: 'Administración de Usuarios',
      currentPath: '/admin/users',
      user: req.user,
      users,
      roles: Object.values(UserRole)
    };
  }
}
