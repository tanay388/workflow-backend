import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { slugify } from '../common/utils/text';
import { Workspace } from './entities/workspace.entity';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    private readonly audit: AuditService,
  ) {}

  async create(orgId: string, userId: string, name: string) {
    const baseSlug = slugify(name) || 'workspace';
    let slug = baseSlug;
    let n = 1;
    while (await this.workspaces.findOne({ where: { orgId, slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const workspace = await this.workspaces.save(
      this.workspaces.create({
        orgId,
        name,
        slug,
        createdBy: userId,
        updatedBy: userId,
      }),
    );

    await this.audit.record({
      orgId,
      actorUserId: userId,
      action: 'workspace.created',
      targetType: 'workspace',
      targetId: workspace.id,
      meta: { name },
    });

    return workspace;
  }

  async listForOrg(orgId: string) {
    return this.workspaces.find({
      where: { orgId },
      order: { createdAt: 'ASC' },
    });
  }

  async getById(id: string) {
    const workspace = await this.workspaces.findOne({ where: { id } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }
}
