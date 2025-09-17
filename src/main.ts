import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '@nestjs/common';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Add X-Robots-Tag to block search engines
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    next();
  });

  // Serve robots.txt to block all crawlers
  app.use('/robots.txt', (req: Request, res: Response) => {
    res.type('text/plain');
    res.send('User-agent: *\nDisallow: /');
  });

  const host = process.env.HOST || '127.0.0.1';
  const port = parseInt(process.env.PORT, 10) || 3000;

  await app.listen(port, host, () => {
    logger.log(`App is running on: http://${host}:${port}`);
  });
}
bootstrap();
