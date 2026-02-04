import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import hbs from 'hbs';
import { fiUtils } from './common/fi-logger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Middleware de fi-utils para identificación de peticiones
  // .identify es la función que actúa como middleware
  app.use(fiUtils.middleware.identify);

  // Configuración de MVC
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });
  // Servir uploads desde la raíz también por precaución
  app.useStaticAssets(join(__dirname, '..', 'uploads'));
  
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');

  // Helpers de Handlebars
  const handlebars = (hbs as any).default || hbs;
  handlebars.registerHelper('json', (context: any) => JSON.stringify(context, null, 2));
  handlebars.registerHelper('eq', (a: any, b: any) => a === b);
  handlebars.registerHelper('isObject', (val: any) => typeof val === 'object' && val !== null && !Array.isArray(val));
  handlebars.registerHelper('isArray', (val: any) => Array.isArray(val));
  handlebars.registerHelper('contains', (str: string, substr: string) => str && str.includes(substr));
  handlebars.registerHelper('getValidation', (results: any, path: string) => {
    if (!results) return [];
    return results[path] || [];
  });
  handlebars.registerHelper('concat', (...args: any[]) => {
    args.pop(); // remove handlebars options
    return args.join('');
  });
  handlebars.registerHelper('hasValidationError', (validations: any[]) => {
    if (!validations) return false;
    return validations.some(v => !v.success);
  });
  handlebars.registerHelper('hasValidationSuccess', (validations: any[]) => {
    if (!validations || validations.length === 0) return false;
    return validations.every(v => v.success);
  });
  
  // Helpers matemáticos y de comparación para paginación
  handlebars.registerHelper('add', (a: number, b: number) => Number(a) + Number(b));
  handlebars.registerHelper('sub', (a: number, b: number) => Number(a) - Number(b));
  handlebars.registerHelper('gt', (a: number, b: number) => Number(a) > Number(b));
  handlebars.registerHelper('lt', (a: number, b: number) => Number(a) < Number(b));
  handlebars.registerHelper('startsWith', (str: string, prefix: string) => str ? String(str).startsWith(prefix) : false);

  // Seguridad y Sesión
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", "https://placeholder.co", "https://ui-avatars.com", "*.googleusercontent.com"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://accounts.google.com"],
        frameSrc: ["'self'", "https://accounts.google.com"],
      },
    }
  }));
  
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'ocr-saas-secret-key-change-me',
      resave: true,
      saveUninitialized: true,
      cookie: {
        maxAge: 3600000 * 24, // 24 horas
        secure: false, // Cambiar a true si se usa HTTPS
        httpOnly: true,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.enableCors({
    origin: '*', // En producción limitar a dominios específicos
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
