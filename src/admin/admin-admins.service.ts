import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { AuditActorType } from '../common/audit/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { PlatformAdmin, PlatformAdminRole } from './entities/platform-admin.entity';
import type { PlatformAdminUser } from './types/platform-admin.types';

@Injectable()
export class AdminAdminsService {
  constructor(
    @InjectRepository(PlatformAdmin) private readonly admins: Repository<PlatformAdmin>,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.admins.find({ order: { createdAt: 'DESC' } }).then((rows) =>
      rows.map((a) => this.toDto(a)),
    );
  }

  async create(
    actor: PlatformAdminUser,
    input: { email: string; name: string; password: string; role: PlatformAdminRole },
  ) {
    const email = input.email.toLowerCase().trim();
    const existing = await this.admins.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const admin = await this.admins.save(
      this.admins.create({
        email,
        name: input.name.trim(),
        passwordHash: await this.passwords.hash(input.password),
        role: input.role,
        isActive: true,
      }),
    );

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.admin.created',
      targetType: 'platform_admin',
      targetId: admin.id,
      meta: { platformAdminId: actor.id, role: admin.role, email: admin.email },
    });

    return this.toDto(admin);
  }

  async update(
    actor: PlatformAdminUser,
    id: string,
    input: { name?: string; role?: PlatformAdminRole },
  ) {
    const admin = await this.admins.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Platform admin not found');
    if (!admin.isActive) throw new BadRequestException('Admin is deactivated');

    if (input.name !== undefined) admin.name = input.name.trim();
    if (input.role !== undefined) {
      if (admin.id === actor.id && input.role !== PlatformAdminRole.SUPERADMIN) {
        throw new BadRequestException('Cannot demote yourself');
      }
      admin.role = input.role;
    }

    await this.admins.save(admin);

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.admin.updated',
      targetType: 'platform_admin',
      targetId: admin.id,
      meta: { platformAdminId: actor.id, ...input },
    });

    return this.toDto(admin);
  }

  async deactivate(actor: PlatformAdminUser, id: string) {
    if (actor.id === id) {
      throw new BadRequestException('Cannot deactivate yourself');
    }

    const admin = await this.admins.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Platform admin not found');
    if (!admin.isActive) return this.toDto(admin);

    admin.isActive = false;
    await this.admins.save(admin);

    await this.audit.record({
      orgId: null,
      actorType: AuditActorType.PLATFORM_ADMIN,
      action: 'platform.admin.deactivated',
      targetType: 'platform_admin',
      targetId: admin.id,
      meta: { platformAdminId: actor.id },
    });

    return this.toDto(admin);
  }

  private toDto(admin: PlatformAdmin) {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  }
}
