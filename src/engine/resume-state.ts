import type { ResumeState } from './engine.types';

export function resumeStateFromJson(raw: Record<string, unknown> | null): ResumeState | null {
  if (!raw) return null;
  return {
    input: raw.input,
    outputs: (raw.outputs as Record<string, unknown>) ?? {},
    vars: (raw.vars as Record<string, unknown>) ?? {},
    loops: (raw.loops as Record<string, number>) ?? undefined,
    nextNodeId: (raw.nextNodeId as string | null) ?? null,
    cancelRequested: Boolean(raw.cancelRequested),
    waitPause: raw.waitPause as ResumeState['waitPause'],
    waitResume: raw.waitResume as ResumeState['waitResume'],
  };
}
