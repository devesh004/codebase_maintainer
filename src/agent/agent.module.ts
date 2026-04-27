import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { ChatModule } from '../chat/chat.module';

import { AgentController } from './agent.controller';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { IntentClassifierService } from './intent-classifier.service';
import { PlannerService } from './planner.service';
import { ExecutorService } from './executor.service';
import { SynthesizerService } from './synthesizer.service';
import { StackTraceParserService } from './stack-trace-parser.service';
import { AgentTraceRepository } from './agent-trace.repository';

@Module({
  imports: [IngestionModule, ChatModule],
  controllers: [AgentController],
  providers: [
    AgentOrchestratorService,
    IntentClassifierService,
    PlannerService,
    ExecutorService,
    SynthesizerService,
    StackTraceParserService,
    AgentTraceRepository,
  ],
})
export class AgentModule {}
