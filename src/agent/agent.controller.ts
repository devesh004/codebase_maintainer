import { Controller, Post, Get, Body, Param, BadRequestException } from '@nestjs/common';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentTraceRepository } from './agent-trace.repository';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly traceRepo: AgentTraceRepository,
  ) {}

  /**
   * Unified agentic endpoint — auto-detects mode (simple / agentic / debug).
   * POST /agent/ask
   */
  @Post('ask')
  async ask(
    @Body('query') query: string,
    @Body('namespace') namespace?: string,
    @Body('sessionId') sessionId?: string,
  ) {
    if (!query?.trim()) {
      throw new BadRequestException('query is required.');
    }
    return this.orchestrator.process(query.trim(), namespace, sessionId);
  }

  /**
   * Explicit debug endpoint — always runs in debug mode.
   * POST /agent/debug
   */
  @Post('debug')
  async debug(
    @Body('error') error: string,
    @Body('namespace') namespace?: string,
    @Body('sessionId') sessionId?: string,
  ) {
    if (!error?.trim()) {
      throw new BadRequestException('error (stack trace or error message) is required.');
    }
    return this.orchestrator.process(error.trim(), namespace, sessionId, 'debug');
  }

  /**
   * Returns the full reasoning trace for a session.
   * GET /agent/sessions/:sessionId/trace
   */
  @Get('sessions/:sessionId/trace')
  async getTrace(@Param('sessionId') sessionId: string) {
    const trace = await this.traceRepo.getTraceBySessionId(sessionId);
    if (!trace) {
      return { sessionId, message: 'No agent trace found for this session.' };
    }
    return trace;
  }
}
