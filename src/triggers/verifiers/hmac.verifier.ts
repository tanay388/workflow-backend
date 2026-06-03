import { Injectable } from '@nestjs/common';
import { CryptoService } from '../../common/crypto/crypto.service';

@Injectable()
export class HmacVerifier {
  constructor(private readonly crypto: CryptoService) {}

  /**
   * Verify `X-Growy-Signature: sha256=<hex>` or `sha256=<hex>` against raw body.
   */
  verify(rawBody: Buffer, secret: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader?.trim()) return false;
    const provided = signatureHeader.replace(/^sha256=/i, '').trim();
    const expected = this.crypto.hmacSha256(rawBody.toString('utf8'), secret);
    return this.crypto.safeEqualHex(provided, expected);
  }
}
