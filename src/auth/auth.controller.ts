import { Controller, Get, UseGuards, Req, Res, Post, Body, Param, Delete, Patch, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { Roles, RolesGuard } from './roles.guard';
import { UserRole } from '../schemas/user.schema';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {
    this.logger.log('Iniciando redirección a Google OAuth');
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    this.logger.log(`Google callback recibido. Usuario: ${req.user?.email}`);
    
    if (!req.user) {
      this.logger.error('No se encontró usuario en la petición tras callback de Google');
      return res.redirect('/admin/login?error=auth_failed');
    }

    // Forzar el inicio de sesión de Passport para que llame al SessionSerializer
    req.logIn(req.user, (err) => {
      if (err) {
        this.logger.error(`Error al iniciar sesión (req.logIn): ${err.message}`);
        return res.redirect('/admin/login?error=session_error');
      }
      this.logger.log(`Sesión creada exitosamente para: ${req.user.email}`);
      return res.redirect('/admin');
    });
  }

  @Get('logout')
  logout(@Req() req, @Res() res) {
    req.logout(() => {
      res.redirect('/admin/login');
    });
  }

  // --- Endpoints de administración de usuarios ---
  
  @Get('users')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async listUsers() {
    return this.authService.getAllUsers();
  }

  @Post('users')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(@Body() body: any) {
    return this.authService.createUser(body);
  }

  @Patch('users/:id')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.authService.updateUser(id, body);
  }

  @Patch('users/:id/role')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.authService.updateUserRole(id, role);
  }

  @Patch('users/:id/status')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async toggleStatus(@Param('id') id: string) {
    return this.authService.toggleUserStatus(id);
  }

  @Delete('users/:id')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }
}
