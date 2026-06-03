import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { CredentialsService } from './credentials.service';
import { UpsertLlmCredentialDto } from './dto/credentials.dto';

@ApiTags('credentials')
@Controller('credentials/llm')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  list(@CurrentTenancy() tenancy: Tenancy) {
    return this.credentials.listForTenancy(tenancy);
  }

  @Roles(MemberRole.ADMIN)
  @Put(':provider')
  upsert(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('provider') provider: string,
    @Body() dto: UpsertLlmCredentialDto,
  ) {
    return this.credentials.upsert(tenancy.orgId!, provider, {
      key: dto.key,
      label: dto.label,
      base_url: dto.base_url,
    });
  }

  @Roles(MemberRole.ADMIN)
  @Delete(':provider')
  async remove(@CurrentTenancy() tenancy: Tenancy, @Param('provider') provider: string) {
    await this.credentials.remove(tenancy.orgId!, provider);
    return { ok: true };
  }
}
