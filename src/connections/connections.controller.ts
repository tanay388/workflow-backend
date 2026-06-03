import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, PatchConnectionDto } from './dto/connections.dto';

@ApiTags('connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get('catalog')
  listCatalog() {
    return this.connections.listCatalog();
  }

  @Get('catalog/trigger-toolkits')
  listTriggerToolkits() {
    return this.connections.listTriggerToolkits();
  }

  @Get('catalog/:toolkit/triggers')
  listToolkitTriggers(@Param('toolkit') toolkit: string) {
    return this.connections.listToolkitTriggers(toolkit);
  }

  @Get('catalog/:toolkit/tools')
  listToolkitTools(@Param('toolkit') toolkit: string) {
    return this.connections.listToolkitTools(toolkit);
  }

  @Get()
  list(
    @CurrentTenancy() tenancy: Tenancy,
    @Query('toolkit') toolkit?: string,
  ) {
    return this.connections.listForToolkit(tenancy, toolkit);
  }

  @Roles(MemberRole.ADMIN, MemberRole.EDITOR)
  @Post()
  async create(
    @CurrentTenancy() tenancy: Tenancy,
    @Body() dto: CreateConnectionDto,
  ) {
    const { connection, redirectUrl } = await this.connections.createPending(
      tenancy,
      dto.toolkit,
      dto.name,
    );
    return {
      id: connection.id,
      toolkit: connection.toolkit,
      name: connection.name,
      status: connection.status,
      redirect_url: redirectUrl,
    };
  }

  @Public()
  @SkipTenancy()
  @Get('callback')
  async callback(
    @Query('connection_id') connectionId: string,
    @Query('connected_account_id') composioConnectionId?: string,
    @Query('connectedAccountId') composioConnectionIdAlt?: string,
  ) {
    const accountId = composioConnectionId ?? composioConnectionIdAlt;
    if (!connectionId || !accountId) {
      return { ok: false, message: 'Missing connection_id or connected_account_id' };
    }
    const row = await this.connections.finalize(connectionId, accountId);
    return { ok: true, connection_id: row.id, status: row.status };
  }

  @Patch(':id')
  patch(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Body() dto: PatchConnectionDto,
  ) {
    return this.connections.patch(tenancy, id, dto);
  }

  @Roles(MemberRole.ADMIN, MemberRole.EDITOR)
  @Post(':id/reconnect')
  reconnect(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.connections.reconnect(tenancy, id);
  }

  @Get(':id/usage')
  usage(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.connections.whereUsed(tenancy, id);
  }

  @Roles(MemberRole.ADMIN)
  @Delete(':id')
  async remove(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    await this.connections.remove(tenancy, id, force === 'true');
    return { ok: true };
  }
}
