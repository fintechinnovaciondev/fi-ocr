import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
  constructor(private tenantService: TenantService) {
    // Se pasan 2 argumentos para satisfacer a TypeScript (Expected 2 arguments).
    // Usamos 'false as any' porque la librería passport-headerapikey desplaza los argumentos
    // y el hack de abajo se encarga de reasignarlos correctamente.
    super({ header: 'x-api-key', prefix: '' }, false as any);
    
    const strategy = this as any;
    if (typeof strategy.passReqToCallback === 'function') {
      strategy.verify = strategy.passReqToCallback;
      strategy.passReqToCallback = false;
    }
  }

  async validate(apiKey: string): Promise<any> {
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('API Key inválida');
    }
    return { tenantId: tenant.tenantId, apiKey };
  }
}
