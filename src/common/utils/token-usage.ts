import type { RunStep } from '../../runs/entities/run-step.entity';

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  costUsd?: number;
}

/** No-op seam for P08 Agent + P15 metering. */
export function recordTokenUsage(_step: RunStep, _usage: TokenUsage): void {
  // intentionally empty
}
