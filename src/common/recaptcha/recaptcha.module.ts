import { Module } from '@nestjs/common';
import { RecaptchaVerifier } from './recaptcha.verifier';

@Module({
  providers: [RecaptchaVerifier],
  exports: [RecaptchaVerifier],
})
export class RecaptchaModule {}
