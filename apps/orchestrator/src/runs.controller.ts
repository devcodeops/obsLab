import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Sse,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { prisma } from '@obslab/db';
import { RunsService } from './runs.service';
import { StreamService, MessageEvent } from './stream.service';
import { CreateRunDto, PaginationDto } from './dto';

interface CallNode {
  id: string;
  parentCallId: string | null;
  fromService: string;
  toService: string;
  route: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  errorType: string | null;
  errorMessage: string | null;
  children: CallNode[];
}

@Controller()
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly streamService: StreamService,
  ) {}

  @Post('runs')
  async createRun(@Body() dto: CreateRunDto) {
    const run = await prisma.run.create({
      data: {
        workflowName: dto.workflow,
        iterations: dto.iterations,
        concurrency: dto.concurrency,
        payloadSize: dto.payloadSize ?? null,
        clientTimeoutMs: dto.clientTimeoutMs,
        retries: dto.retryPolicy?.retries ?? 0,
        backoffMs: dto.retryPolicy?.backoffMs ?? 0,
      },
    });

    this.streamService.emitGlobal({
      type: 'run_created',
      runId: run.id,
      workflow: run.workflowName,
      iterations: run.iterations,
    });

    // Fire and forget - do not await
    this.runsService.executeRun(run.id, dto);

    return { runId: run.id };
  }

  @Get('runs')
  async listRuns(@Query() pagination: PaginationDto) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.run.findMany({
        orderBy: { startedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.run.count(),
    ]);

    return { items, total, page, pageSize };
  }

  @Post('runs/clear')
  async clearRuns() {
    const result = await prisma.$transaction(async (tx) => {
      const deletedCalls = await tx.call.deleteMany();
      const deletedRuns = await tx.run.deleteMany();
      return { deletedRuns: deletedRuns.count, deletedCalls: deletedCalls.count };
    });

    this.streamService.emitGlobal({
      type: 'runs_cleared',
      deletedRuns: result.deletedRuns,
      deletedCalls: result.deletedCalls,
    });

    return { ok: true, ...result };
  }

  @Sse('runs/global/events')
  globalEvents(): Observable<MessageEvent> {
    return this.streamService.getGlobalStream();
  }

  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: { calls: true },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found`);
    }

    const callGraph = buildCallGraph(run.calls);

    return { ...run, callGraph };
  }

  @Sse('runs/:runId/events')
  runEvents(@Param('runId') runId: string): Observable<MessageEvent> {
    return this.streamService.getRunStream(runId);
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'orchestrator',
      time: new Date().toISOString(),
    };
  }

  @Get('metrics')
  metrics() {
    return { status: 'ok', note: 'Prometheus endpoint stub' };
  }
}

function buildCallGraph(
  calls: Array<{
    id: string;
    parentCallId: string | null;
    fromService: string;
    toService: string;
    route: string;
    method: string;
    statusCode: number | null;
    durationMs: number;
    errorType: string | null;
    errorMessage: string | null;
  }>,
): CallNode[] {
  const nodeMap = new Map<string, CallNode>();
  for (const call of calls) {
    nodeMap.set(call.id, {
      id: call.id,
      parentCallId: call.parentCallId,
      fromService: call.fromService,
      toService: call.toService,
      route: call.route,
      method: call.method,
      statusCode: call.statusCode,
      durationMs: call.durationMs,
      errorType: call.errorType,
      errorMessage: call.errorMessage,
      children: [],
    });
  }

  const roots: CallNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentCallId && nodeMap.has(node.parentCallId)) {
      nodeMap.get(node.parentCallId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
