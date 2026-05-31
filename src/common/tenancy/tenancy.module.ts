import { Global, Module } from '@nestjs/common';
import { TenancyContextService } from './tenancy-context.service';

/**
 * Provides the request-scoped {@link TenancyContextService} globally.
 * The {@link TenancyMiddleware} that opens the scope is applied in AppModule.
 */
@Global()
@Module({
  providers: [TenancyContextService],
  exports: [TenancyContextService],
})
export class TenancyModule {}
