import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/**
 * Global crypto module (TRD §10.3). The single owner of AES-256-GCM
 * encrypt/decrypt/fingerprint; business code injects {@link CryptoService}
 * and never imports `node:crypto` itself.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
