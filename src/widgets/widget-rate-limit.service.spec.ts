import { WidgetRateLimitService } from './widget-rate-limit.service';

describe('WidgetRateLimitService', () => {
  const messages = { createQueryBuilder: jest.fn() };
  const conversations = {};
  let service: WidgetRateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WidgetRateLimitService(
      messages as never,
      conversations as never,
    );
  });

  it('isOverLimit when count meets limit', async () => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: 100 }),
    };
    messages.createQueryBuilder.mockReturnValue(qb);

    await expect(service.isOverLimit('v1', 100)).resolves.toBe(true);
    await expect(service.isOverLimit('v1', 101)).resolves.toBe(false);
  });
});
