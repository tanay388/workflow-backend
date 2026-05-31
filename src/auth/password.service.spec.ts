import { Test } from '@nestjs/testing';
import { AppConfigService } from '../common/config/config.service';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: AppConfigService,
          useValue: {
            argon2: { memoryCost: 65536, timeCost: 2, parallelism: 1 },
          },
        },
      ],
    }).compile();
    service = module.get(PasswordService);
  });

  it('hashes and verifies a password', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash).not.toContain('correct horse');
    expect(await service.verify(hash, 'correct horse battery')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('secret123');
    expect(await service.verify(hash, 'wrong')).toBe(false);
  });
});
