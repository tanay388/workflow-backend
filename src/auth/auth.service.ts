import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { EmailOtpPurpose } from './entities/email-otp.entity';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { InvalidRefreshTokenError, TokenService } from './token.service';
import type { AuthResponse, AuthUser } from './types/auth.types';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly otps: OtpService,
  ) {}

  async signup(dto: SignupDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.save(
      this.users.create({
        email,
        name: dto.name,
        passwordHash,
        emailVerifiedAt: null,
      }),
    );

    await this.otps.createAndSend(user.id, user.email, user.name);
    return { message: 'Account created. Check your email for a verification code.' };
  }

  async verifyOtp(email: string, code: string): Promise<{ message: string }> {
    const user = await this.findByEmail(email);
    if (user.emailVerifiedAt) {
      return { message: 'Email already verified.' };
    }
    await this.verifyOtpForUser(user, code);
    user.emailVerifiedAt = new Date();
    await this.users.save(user);
    return { message: 'Email verified. You can now log in.' };
  }

  async resendOtp(email: string): Promise<{ message: string }> {
    const user = await this.findByEmail(email);
    if (user.emailVerifiedAt) {
      return { message: 'Email already verified.' };
    }
    await this.otps.createAndSend(user.id, user.email, user.name);
    return { message: 'A new verification code has been sent.' };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.findByEmail(dto.email);
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Email not verified');
    }
    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.toAuthResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let rotated: { userId: string; refreshToken: string };
    try {
      rotated = await this.tokens.rotateRefreshToken(refreshToken);
    } catch (err) {
      if (err instanceof InvalidRefreshTokenError) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      // Transient failures (DB unavailable during a restart, …) must surface
      // as 5xx — a 401 here would make clients discard a still-valid token.
      throw err;
    }

    const user = await this.users.findOne({ where: { id: rotated.userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    const accessToken = this.tokens.signAccessToken(this.toAuthUser(user));
    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      user: this.toAuthUser(user),
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.tokens.revokeRefreshToken(refreshToken);
    return { message: 'Logged out' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const message =
      'If an account exists for that email, we sent a password reset code.';
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user?.emailVerifiedAt) {
      return { message };
    }
    await this.otps.createAndSend(
      user.id,
      user.email,
      user.name,
      EmailOtpPurpose.PASSWORD_RESET,
    );
    return { message };
  }

  async resetPassword(
    email: string,
    code: string,
    password: string,
  ): Promise<{ message: string }> {
    const user = await this.findByEmail(email);
    await this.verifyOtpForUser(user, code, EmailOtpPurpose.PASSWORD_RESET);
    user.passwordHash = await this.passwords.hash(password);
    await this.users.save(user);
    return { message: 'Password updated. You can now sign in.' };
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const user = await this.users.findOne({ where: { id } });
    return user ? this.toAuthUser(user) : null;
  }

  private async findByEmail(email: string): Promise<User> {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  private async verifyOtpForUser(
    user: User,
    code: string,
    purpose: EmailOtpPurpose = EmailOtpPurpose.SIGNUP_VERIFY,
  ): Promise<void> {
    try {
      await this.otps.verify(user.id, code, purpose);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'OTP_INVALID';
      if (code === 'OTP_EXPIRED') throw new UnauthorizedException('Verification code expired');
      if (code === 'OTP_MAX_ATTEMPTS') {
        throw new UnauthorizedException('Too many invalid attempts');
      }
      throw new UnauthorizedException('Invalid verification code');
    }
  }

  private async toAuthResponse(user: User): Promise<AuthResponse> {
    const authUser = this.toAuthUser(user);
    const tokens = await this.tokens.issueTokenPair(authUser);
    return { ...tokens, user: authUser };
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}
