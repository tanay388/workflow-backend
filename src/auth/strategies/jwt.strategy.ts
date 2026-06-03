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
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => {
          const q = req?.query?.access_token;
          return typeof q === 'string' ? q : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.aud && payload.aud !== 'tenant') {
      throw new UnauthorizedException();
    }
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
