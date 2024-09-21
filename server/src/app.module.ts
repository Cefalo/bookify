import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CalenderModule } from './calender/calender.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import typeOrmConfig from './config/orm.config';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/env/app.config';
import dbConfig from './config/env/db.config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client', 'build_web'),
      renderPath: '*', //  ensures all routes are redirected to index.html
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === 'development' ? `.env.development` : `.env`,
      load: [appConfig, dbConfig],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: process.env.NODE_ENV === 'development' ? 1000 : 20,
      },
    ]),
    AuthModule,
    CalenderModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
