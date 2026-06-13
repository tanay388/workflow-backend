import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { SkipTenancy } from '../common/decorators/skip-tenancy.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { AuthUser } from './types/auth.types';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  return req.ip ?? 'unknown';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Public()
  @Post('signup')
  signup(@Req() req: Request, @Body() dto: SignupDto) {
    this.rateLimit.consumeAuth('signup', clientIp(req), dto.email);
    return this.auth.signup(dto);
  }

  @Public()
  @Post('verify-otp')
  verifyOtp(@Req() req: Request, @Body() dto: VerifyOtpDto) {
    this.rateLimit.consumeAuth('verify-otp', clientIp(req), dto.email);
    return this.auth.verifyOtp(dto.email, dto.code);
  }

  @Public()
  @Post('resend-otp')
  resendOtp(@Req() req: Request, @Body() dto: ResendOtpDto) {
    this.rateLimit.consumeAuth('resend-otp', clientIp(req), dto.email);
    return this.auth.resendOtp(dto.email);
  }

  @Public()
  @Post('login')
  login(@Req() req: Request, @Body() dto: LoginDto) {
    this.rateLimit.consumeAuth('login', clientIp(req), dto.email);
    return this.auth.login(dto);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Req() req: Request, @Body() dto: ForgotPasswordDto) {
    this.rateLimit.consumeAuth('forgot-password', clientIp(req), dto.email);
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Req() req: Request, @Body() dto: ResetPasswordDto) {
    this.rateLimit.consumeAuth('reset-password', clientIp(req), dto.email);
    return this.auth.resetPassword(dto.email, dto.code, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Req() req: Request, @Body() dto: RefreshDto) {
    this.rateLimit.consumeRefresh(clientIp(req));
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Body() dto: LogoutDto) {
    this.rateLimit.consumeAuth('logout', clientIp(req));
    return this.auth.logout(dto.refreshToken);
  }

  @SkipTenancy()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
