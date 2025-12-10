import { Test, TestingModule } from '@nestjs/testing';
import { BlackjackGateway } from './blackjack.gateway';

describe('BlackjackGateway', () => {
  let gateway: BlackjackGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlackjackGateway],
    }).compile();

    gateway = module.get<BlackjackGateway>(BlackjackGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
