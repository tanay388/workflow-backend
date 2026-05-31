import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './config.schema';
import { AppConfigService } from './config.service';

/**
 * Global configuration module (TRD §3.1). Loads + validates the environment
 * once at boot and exposes typed access via {@link AppConfigService}.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
