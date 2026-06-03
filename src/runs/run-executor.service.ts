import { Injectable } from '@nestjs/common';
import { RunService } from './run.service';

/** Thin wrapper so dispatcher can invoke execution without circular deps. */
@Injectable()
export class RunExecutorService {
  constructor(private readonly runs: RunService) {}

  executeRun(runId: string): Promise<void> {
    return this.runs.executeRun(runId);
  }
}
