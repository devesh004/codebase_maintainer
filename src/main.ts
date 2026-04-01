import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { connectToDB } from './shared/dbConnections/postgreSQL';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  await connectToDB();
  await app.listen(process.env.PORT ?? 4000);
  console.log(`Application is running on port ${process.env.PORT ?? 4000}`);
}
bootstrap();
