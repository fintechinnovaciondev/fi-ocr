import { PassportSerializer } from '@nestjs/passport';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../schemas/user.schema';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  private readonly logger = new Logger(SessionSerializer.name);

  constructor(private readonly authService: AuthService) {
    super();
    this.logger.log('SessionSerializer instanciado correctamente');
  }

  serializeUser(user: any, done: (err: Error | null, user: any) => void): any {
    this.logger.log(`Serializando usuario: ${user.email}`);
    done(null, { id: user._id, email: user.email });
  }

  async deserializeUser(
    payload: any,
    done: (err: Error | null, user: any) => void,
  ): Promise<any> {
    this.logger.log(`Deserializando usuario desde payload: ${payload.email}`);
    try {
      const user = await this.authService.findUserByEmail(payload.email);
      if (!user) {
        this.logger.warn(`No se encontró el usuario en DB durante deserialización: ${payload.email}`);
      }
      done(null, user);
    } catch (error) {
      this.logger.error(`Error en deserialización: ${error.message}`);
      done(error, null);
    }
  }
}
