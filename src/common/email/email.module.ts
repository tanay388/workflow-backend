import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Global email module (TRD §2, §10.1). Single Nodemailer + Handlebars sender
 * reused by OTP, usage alerts, and approval-link delivery.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
