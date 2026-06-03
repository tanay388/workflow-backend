import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../common/llm/llm.module';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { LlmCredential } from './entities/llm-credential.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LlmCredential]), LlmModule],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService, TypeOrmModule],
})
export class CredentialsModule {}
