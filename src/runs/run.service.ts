import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { backoffResumeAt } from '../common/utils/backoff';
import type { WorkflowGraph } from '../common/types/graph';
import { mergeRunInput } from '../common/utils/workflow-variables';
import { AppConfigService } from '../common/config/config.service';
import type { Tenancy } from '../common/tenancy/tenancy-context.service';
import { ByokValidationService } from '../engine/byok-validation.service';
import { EngineError, resolveMaxSteps } from '../engine/engine.types';
import { resumeStateFromJson } from '../engine/resume-state';
import { WorkflowEngine } from '../engine/workflow-engine';
import { WorkflowVersion } from '../workflows/entities/workflow-version.entity';
import { Workflow } from '../workflows/entities/workflow.entity';
import { RunStep } from './entities/run-step.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { WaitService } from '../approvals/wait.service';
import { ChatStreamSink } from '../chat/chat-stream-sink.service';
import { WorkflowTriggerService } from '../triggers/workflow-trigger.service';
import { PgRunEventBus } from './pg-run-event-bus.service';
import { PgRunQueue } from './pg-run-queue.service';
import { MeteringServiceImpl } from '../metering/metering.service';

export interface EnqueueRunDto {
  input?: unknown;
  triggerSource?: string;
}

@Injectable()
export class RunService {
  private readonly logger = new Logger(RunService.name);

  constructor(
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(RunStep) private readonly steps: Repository<RunStep>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowVersion) private readonly versions: Repository<WorkflowVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly engine: WorkflowEngine,
    private readonly queue: PgRunQueue,
    private readonly eventBus: PgRunEventBus,
    private readonly cfg: AppConfigService,
    private readonly byok: ByokValidationService,
    private readonly wait: WaitService,
    private readonly metering: MeteringServiceImpl,
    @Optional()
    @Inject(forwardRef(() => WorkflowTriggerService))
    private readonly workflowTriggers?: WorkflowTriggerService,
    @Optional()
    private readonly chatStream?: ChatStreamSink,
  ) {}

  async forceResume(tenancy: Tenancy, runId: string): Promise<{ resumed: boolean }> {
    const run = await this.runs.findOne({
      where: { id: runId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!run) throw new NotFoundException('Run not found');
    if (run.status !== 'paused') {
      throw new BadRequestException('Only paused runs can be force-resumed');
    }
    const resumed = await this.wait.resume(runId, 'continue');
    if (resumed) {
      await this.publishRunEvent(runId, 'queued');
    }
    return { resumed };
  }

  async enqueue(
    tenancy: Tenancy,
    workflowId: string,
    userId: string,
    dto: EnqueueRunDto = {},
  ): Promise<{ runId: string; status: string }> {
    const wf = await this.workflows.findOne({
      where: { id: workflowId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!wf?.currentVersionId) {
      throw new NotFoundException('Workflow not found or has no published version');
    }

    if (!tenancy.orgId || !tenancy.workspaceId) {
      throw new NotFoundException('Organization and workspace required');
    }

    const version = await this.versions.findOne({ where: { id: wf.currentVersionId } });
    const graph = version?.graph as WorkflowGraph | undefined;
    if (graph) {
      const problems = await this.byok.validateGraph(tenancy.orgId, graph);
      if (problems.length > 0) {
        throw new BadRequestException(problems[0]!.message);
      }
    }

    const triggerSource = dto.triggerSource ?? 'manual';
    const runInput = graph ? mergeRunInput(graph, dto.input) : dto.input ?? {};

    const { runId } = await this.queue.enqueue({
      orgId: tenancy.orgId,
      workspaceId: tenancy.workspaceId,
      workflowId,
      workflowVersionId: wf.currentVersionId,
      triggerSource,
      runBy: { type: 'user', id: userId, label: 'Manual run' },
      input: runInput,
    });

    return { runId, status: 'queued' };
  }

  async cancel(tenancy: Tenancy, runId: string): Promise<{ status: string }> {
    const run = await this.runs.findOne({
      where: { id: runId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!run) throw new NotFoundException('Run not found');

    if (run.status === 'queued') {
      await this.runs.update(runId, { status: 'canceled', finishedAt: new Date() });
      await this.finalizeRunMetering(runId);
      await this.publishRunEvent(runId, 'canceled');
      return { status: 'canceled' };
    }

    if (run.status === 'running') {
      const state = resumeStateFromJson(run.resumeState) ?? {
        input: run.input,
        outputs: {},
        vars: {},
        nextNodeId: null,
      };
      state.cancelRequested = true;
      await this.runs.update(runId, {
        resumeState: state as unknown as WorkflowRun['resumeState'],
      } as Parameters<Repository<WorkflowRun>['update']>[1]);
      return { status: 'running' };
    }

    if (run.status === 'paused') {
      await this.queue.markDone(runId, 'canceled');
      await this.finalizeRunMetering(runId);
      await this.publishRunEvent(runId, 'canceled');
      return { status: 'canceled' };
    }

    return { status: run.status };
  }

  async rerun(tenancy: Tenancy, runId: string, userId: string): Promise<{ runId: string; status: string }> {
    const run = await this.runs.findOne({
      where: { id: runId, orgId: tenancy.orgId, workspaceId: tenancy.workspaceId },
    });
    if (!run) throw new NotFoundException('Run not found');
    if (!['completed', 'failed', 'canceled'].includes(run.status)) {
      throw new BadRequestException('Only terminal runs can be rerun');
    }

    const { runId: newId } = await this.queue.enqueue({
      orgId: run.orgId,
      workspaceId: run.workspaceId,
      workflowId: run.workflowId,
      workflowVersionId: run.workflowVersionId,
      triggerSource: run.triggerSource,
      runBy: { type: 'user', id: userId, label: 'Rerun' },
      input: run.input,
    });
    return { runId: newId, status: 'queued' };
  }

  async executeRun(runId: string): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run || run.status !== 'running') return;

    const version = await this.versions.findOne({ where: { id: run.workflowVersionId } });
    if (!version) {
      await this.queue.markDone(runId, 'failed', 'Workflow version not found');
      await this.finalizeRunMetering(runId);
      return;
    }

    const graph = version.graph as WorkflowGraph;
    const byokProblems = await this.byok.validateGraph(run.orgId, graph);
    if (byokProblems.length > 0) {
      await this.queue.markDone(runId, 'failed', byokProblems[0]!.message);
      await this.finalizeRunMetering(runId);
      await this.publishRunEvent(runId, 'failed');
      return;
    }

    const maxSteps = resolveMaxSteps(graph, this.cfg.worker.maxSteps);
    const preset = resumeStateFromJson(run.resumeState);
    const startNodeId = preset?.nextNodeId ?? undefined;

    const stepSeqStart = await this.steps.count({ where: { runId } });

    try {
      const result = await this.engine.run({
        graph,
        runId,
        orgId: run.orgId,
        workspaceId: run.workspaceId,
        workflowId: run.workflowId,
        workflowVersionId: run.workflowVersionId,
        input: run.input,
        triggerSource: run.triggerSource,
        conversationId: run.conversationId,
        messageId: run.messageId,
        maxSteps,
        startNodeId,
        presetState: preset ?? undefined,
        isCanceled: async () => {
          const fresh = await this.runs.findOne({ where: { id: runId } });
          const st = resumeStateFromJson(fresh?.resumeState ?? null);
          return Boolean(st?.cancelRequested);
        },
        onStepStart: async (p) => {
          await this.dataSource.transaction(async (em) => {
            const step = em.getRepository(RunStep).create({
              id: p.stepId,
              runId,
              orgId: run.orgId,
              nodeId: p.nodeId,
              nodeType: p.nodeType,
              nodeLabel: p.nodeLabel,
              status: 'running',
              input: p.input,
              seq: stepSeqStart + p.seq,
              startedAt: new Date(),
            });
            await em.getRepository(RunStep).save(step);
          });
          await this.eventBus.publish(runId, {
            kind: 'step',
            runId,
            stepId: p.stepId,
            nodeId: p.nodeId,
            nodeType: p.nodeType,
            phase: 'start',
            status: 'running',
            seq: stepSeqStart + p.seq,
            ts: Date.now(),
          });
        },
        onStepEnd: async (p) => {
          await this.steps.update(
            p.stepId,
            {
              status: p.status,
              output: p.output,
              error: p.error ?? null,
              endedAt: new Date(),
            } as Parameters<Repository<RunStep>['update']>[1],
          );
          await this.eventBus.publish(runId, {
            kind: 'step',
            runId,
            stepId: p.stepId,
            nodeId: p.nodeId,
            nodeType: p.nodeType,
            phase: 'end',
            status: p.status,
            seq: stepSeqStart + p.seq,
            ts: Date.now(),
          });
        },
        onBoundary: async (p) => {
          await this.dataSource.transaction(async (em) => {
            await em.getRepository(WorkflowRun).update(
              runId,
              {
                lastCompletedNodeId: p.lastCompletedNodeId,
                resumeState: p.resumeState as unknown as WorkflowRun['resumeState'],
                ...(p.output !== undefined ? { output: p.output } : {}),
              } as Parameters<Repository<WorkflowRun>['update']>[1],
            );
          });
        },
      });

      if (result.status === 'completed') {
        await this.runs.update(
          runId,
          {
            status: 'completed',
            output: result.output,
            finishedAt: new Date(),
            lockedBy: null,
            lockedAt: null,
          } as Parameters<Repository<WorkflowRun>['update']>[1],
        );
        await this.publishRunEvent(runId, 'completed');
        await this.finalizeRunMetering(runId);
        if (
          (run.triggerSource === 'chat' || run.triggerSource === 'widget') &&
          run.messageId &&
          this.chatStream
        ) {
          await this.chatStream.finalizeAssistantMessage(run.messageId, runId);
        }
        void this.workflowTriggers?.onRunFinished(runId).catch((e) =>
          this.logger.warn(`Workflow chain hook failed for ${runId}: ${e}`),
        );
      } else if (result.status === 'paused') {
        await this.publishRunEvent(runId, 'paused', {
          until: result.paused?.resumeAt?.toISOString() ?? null,
        });
      } else if (result.status === 'canceled') {
        await this.queue.markDone(runId, 'canceled');
        await this.finalizeRunMetering(runId);
        await this.publishRunEvent(runId, 'canceled');
      }
    } catch (err) {
      await this.handleFailure(run, err);
    }
  }

  private async handleFailure(run: WorkflowRun, err: unknown): Promise<void> {
    const message =
      err instanceof EngineError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);

    const attempts = run.attempts + 1;
    if (attempts < run.maxAttempts) {
      const resumeAt = backoffResumeAt(attempts);
      await this.runs.update(run.id, {
        attempts,
        status: 'paused',
        resumeAt,
        waitMode: 'time_based',
        error: message,
        lockedBy: null,
        lockedAt: null,
      });
      await this.publishRunEvent(run.id, 'paused', { until: resumeAt.toISOString() });
      return;
    }

    await this.runs.update(run.id, {
      attempts,
      status: 'failed',
      error: message,
      finishedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
    });
    await this.publishRunEvent(run.id, 'failed');
    await this.finalizeRunMetering(run.id);
    if (
      (run.triggerSource === 'chat' || run.triggerSource === 'widget') &&
      run.messageId &&
      this.chatStream
    ) {
      await this.chatStream.failMessage(run.messageId, run.id, message);
    }
    void this.workflowTriggers?.onRunFinished(run.id).catch((e) =>
      this.logger.warn(`Workflow chain hook failed for ${run.id}: ${e}`),
    );
    this.logger.warn(`Run ${run.id} failed: ${message}`);
  }

  private async finalizeRunMetering(runId: string): Promise<void> {
    try {
      await this.metering.rollupRunTotals(runId);
    } catch (err) {
      this.logger.warn(`Run metering rollup failed for ${runId}: ${err}`);
    }
  }

  private async publishRunEvent(
    runId: string,
    status: string,
    waitingOn?: { until: string | null },
  ): Promise<void> {
    await this.eventBus.publish(runId, {
      kind: 'run',
      runId,
      status,
      waitingOn: waitingOn ?? null,
      ts: Date.now(),
    });
  }

}
