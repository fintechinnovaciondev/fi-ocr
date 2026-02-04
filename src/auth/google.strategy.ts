import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const { name, emails, photos } = profile;
    const userDetails = {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0].value,
    };

    this.logger.log(`Intento de login Google para: ${userDetails.email}`);

    try {
      const user = await this.authService.validateUser(userDetails);
      
      if (!user) {
        this.logger.warn(`El servicio de autenticación no devolvió un usuario para: ${userDetails.email}`);
        return done(null, false, { message: 'Usuario no encontrado en el sistema' });
      }

      if (!user.isActive) {
        this.logger.warn(`Usuario inactivo intentando acceder: ${userDetails.email}`);
        return done(null, false, { message: 'Cuenta desactivada' });
      }

      this.logger.log(`Login exitoso: ${user.email} con rol: ${user.role}`);
      done(null, user);
    } catch (err) {
      this.logger.error(`Error en GoogleStrategy.validate para ${userDetails.email}: ${err.message}`);
      done(err, null);
    }
  }
}
