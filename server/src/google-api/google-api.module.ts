import { Module } from '@nestjs/common';
import { GoogleApiService } from './google-api.service';
import { GoogleApiMockService } from './google-api-mock.service';

@Module({
  providers: [
    {
      provide: 'IGoogleApiService',
      useClass: process.env.NODE_ENV === 'production' ? GoogleApiService : GoogleApiMockService,
    },
  ],
  exports: ['IGoogleApiService'],
})
export class GoogleApiModule {}
