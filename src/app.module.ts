import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { IamModule } from './iam/iam.module';

/**
 * Root module. CommonModule provides all cross-cutting infrastructure
 * (config, logging, db, crypto, email, tenancy). Feature modules (auth, iam,
 * workflows, …) are added in their respective phases.
 */
@Module({
  imports: [CommonModule, HealthModule, AuthModule, IamModule],
})
export class AppModule {}
