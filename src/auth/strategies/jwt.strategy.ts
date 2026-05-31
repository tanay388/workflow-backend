import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../common/config/config.service';
import { TenancyContextService } from '../../common/tenancy/tenancy-context.service';
import { AuthService } from '../auth.service';
import type { AuthUser, JwtPayload } from '../types/auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly auth: AuthService,
    private readonly tenancy: TenancyContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.auth.getUserById(payload.sub);
    if (!user) throw new UnauthorizedException();
    this.tenancy.set({
      userId: payload.sub,
      orgId: payload.org_id ?? undefined,
      workspaceId: payload.workspace_id ?? undefined,
      role: payload.role ?? undefined,
    });
    return user;
  }
}
