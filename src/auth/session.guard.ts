import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.isAuthenticated()) {
      return true;
    }
    
    // Si no está autenticado, redirigir al login si es una vista, o fallar si es API
    const url = request.url;
    if (url.startsWith('/api/')) {
        throw new UnauthorizedException('No autenticado');
    }

    const response = context.switchToHttp().getResponse();
    response.redirect('/admin/login');
    return false;
  }
}
