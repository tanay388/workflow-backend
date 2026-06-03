import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { AppConfigService } from '../../common/config/config.service';
import {
  PLATFORM_ROUTE_KEY,
  PLATFORM_STEP_UP_KEY,
  PLATFORM_WRITE_KEY,
} from '../decorators/platform-admin.decorator';
import { AdminAuthService } from '../admin-auth.service';
import { PlatformStepUpService } from '../platform-step-up.service';
import { PlatformAdminRole } from '../entities/platform-admin.entity';
import type { PlatformJwtPayload } from '../types/platform-admin.types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly adminAuth: AdminAuthService,
    private readonly stepUp: PlatformStepUpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(PLATFORM_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPlatformRoute) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      platformAdmin?: { id: string; email: string; name: string; role: PlatformAdminRole };
    }>();

    const authHeader = request.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    if (!token) throw new UnauthorizedException();

    let payload: PlatformJwtPayload;
    try {
      payload = this.jwt.verify<PlatformJwtPayload>(token, {
        secret: this.config.jwt.platformSecret,
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.aud !== 'platform') throw new UnauthorizedException();

    const admin = await this.adminAuth.getById(payload.sub);
    if (!admin) throw new UnauthorizedException();

    const requiresWrite = this.reflector.getAllAndOverride<boolean>(PLATFORM_WRITE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiresWrite && admin.role === PlatformAdminRole.SUPPORT) {
      throw new ForbiddenException('Support role is read-only');
    }

    const requiresStepUp = this.reflector.getAllAndOverride<boolean>(PLATFORM_STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiresStepUp) {
      const raw = request.headers['x-confirm-token'];
      const confirmToken = typeof raw === 'string' ? raw : undefined;
      if (!this.stepUp.consumeConfirmToken(admin.id, confirmToken)) {
        throw new ForbiddenException('Step-up confirmation required');
      }
    }

    request.platformAdmin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    return true;
  }
}
