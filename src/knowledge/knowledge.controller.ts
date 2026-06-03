import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenancy } from '../common/decorators/current-tenancy.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MemberRole } from '../common/rbac/roles';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { CreateKnowledgeBaseDto, SearchKnowledgeBaseDto } from './dto/knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge-bases')
@Controller('knowledge-bases')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  list(@CurrentTenancy() tenancy: Tenancy) {
    return this.knowledge.list(tenancy);
  }

  @Get(':id')
  get(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.knowledge.get(tenancy, id);
  }

  @Roles(MemberRole.EDITOR)
  @Post()
  create(@CurrentTenancy() tenancy: Tenancy, @Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledge.create(tenancy, dto.name);
  }

  @Roles(MemberRole.EDITOR)
  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    return this.knowledge.uploadFile(tenancy, id, file.originalname, file.buffer);
  }

  @Roles(MemberRole.EDITOR)
  @Delete(':id/files/:fileId')
  removeFile(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.knowledge.deleteFile(tenancy, id, fileId);
  }

  @Roles(MemberRole.EDITOR)
  @Delete(':id')
  remove(@CurrentTenancy() tenancy: Tenancy, @Param('id') id: string) {
    return this.knowledge.deleteBase(tenancy, id);
  }

  @Get(':id/search')
  search(
    @CurrentTenancy() tenancy: Tenancy,
    @Param('id') id: string,
    @Query() query: SearchKnowledgeBaseDto,
  ) {
    return this.knowledge.search(tenancy, id, query.query, query.top_k ?? 5);
  }
}
