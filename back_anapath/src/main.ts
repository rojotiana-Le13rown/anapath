import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Utf8Interceptor } from './common/interceptors/utf8.interceptor';
import { Utf8Pipe } from './common/pipes/utf8.pipe';
import { ChuClient } from './common/clients/chu.client';
import { AccueilClient } from './common/clients/accueil.client';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Relève la limite du body (défaut 100 Ko) : les photos de profil envoyées en
  // base64 dépassent facilement cette limite.
  app.useBodyParser('json', { limit: '15mb' });
  app.useBodyParser('urlencoded', { limit: '15mb', extended: true });

  const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  const corsOrigins = [
    ...new Set([
      ...configuredOrigins,
      'http://localhost:3031',
      'http://127.0.0.1:3031',
    ]),
  ].filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  app.useGlobalPipes(new Utf8Pipe());
  app.useGlobalInterceptors(new Utf8Interceptor());
  
  app.setGlobalPrefix('api');
  
  const config = new DocumentBuilder()
    .setTitle('API Anapath')
    .setDescription('API pour la gestion des examens d\'anatomie pathologique')
    .setVersion('1.0')
    .addTag('anapath', 'Endpoints pour les demandes d\'examen')
    .addTag('notifications', 'Endpoints pour recevoir des notifications')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  
  const port = process.env.PORT || 3334;
  await app.listen(port);

  const chuClient = new ChuClient();
  new AccueilClient();

  const serviceInfo = await chuClient.getAnapathServiceInfo();
  console.log(
    serviceInfo
      ? `✅ CHU Service OK : ${serviceInfo.name}`
      : `⚠️ CHU Service indisponible`,
  );

  console.log(`🚀 Backend Anapath démarré sur http://localhost:${port}`);
  console.log(`📚 Documentation Swagger disponible sur http://localhost:${port}/api/docs`);
}
bootstrap();
