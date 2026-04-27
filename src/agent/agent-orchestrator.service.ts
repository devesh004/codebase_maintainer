import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import * as crypto from 'crypto';

import { VectorStorageService } from '../ingestion/vector-storage.service';
import { ProjectRepository } from '../ingestion/project.repository';
import { ChatRepository } from '../chat/chat.repository';
import { IntentClassifierService, QueryMode } from './intent-classifier.service';
import { PlannerService } from './planner.service';
import { ExecutorService, SourceReference, StepResult } from './executor.service';
import { SynthesizerService } from './synthesizer.service';
import { StackTraceParserService } from './stack-trace-parser.service';
import { AgentTraceRepository } from './agent-trace.repository';

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private llm: ChatGroq;

  constructor(
    private readonly vectorStorage: VectorStorageService,
    private readonly projectRepo: ProjectRepository,
    private readonly chatRepo: ChatRepository,
    private readonly intentClassifier: IntentClassifierService,
    private readonly planner: PlannerService,
    private readonly executor: ExecutorService,
    private readonly synthesizer: SynthesizerService,
    private readonly stackParser: StackTraceParserService,
    private readonly traceRepo: AgentTraceRepository,
  ) {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
    });
  }

  async process(
    query: string,
    namespace?: string,
    sessionId?: string,
    forceMode?: QueryMode,
  ) {
    const activeSessionId = sessionId || crypto.randomUUID();
    const mode: QueryMode = forceMode || this.intentClassifier.classify(query);

    this.logger.log(`[${mode.toUpperCase()}] session=${activeSessionId} ns="${namespace || 'default'}"`);

    const projectContext = namespace
      ? await this.projectRepo.getProjectContext(namespace)
      : null;
    const projectSummary = projectContext
      ? `${projectContext.projectName}: ${projectContext.summary}`
      : undefined;

    try {
      if (mode === 'debug') {
        return await this.handleDebug(query, namespace, activeSessionId, projectSummary);
      }
      if (mode === 'agentic') {
        return await this.handleAgentic(query, namespace, activeSessionId, projectSummary);
      }
      return await this.handleSimple(query, namespace, activeSessionId, projectSummary);
    } catch (error) {
      this.logger.error('Agent processing failed', (error as Error).stack);
      throw new InternalServerErrorException('Agent failed to process your request.');
    }
  }

  // ─── SIMPLE MODE ──────────────────────────────────────────────────────────────

  private async handleSimple(
    query: string,
    namespace: string | undefined,
    sessionId: string,
    projectSummary: string | undefined,
  ) {
    const docs = await this.vectorStorage.search(query, 8, namespace);
    const sources = this.executor.buildSourcesFromDocs(docs);

    const contextText = docs
      .map((doc, i) => {
        const src = doc.metadata?.source || 'Unknown';
        return `--- Snippet ${i + 1} from ${src} ---\n${doc.pageContent}`;
      })
      .join('\n\n');

    const history = await this.chatRepo.getMessagesBySessionId(sessionId);
    const historyMessages = history.map(m =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    );

    const systemPrompt = `You are an expert Software Engineer and Codebase Maintainer assistant.
${projectSummary ? `Project: ${projectSummary}\n` : ''}
Use the provided code snippets to answer accurately and concisely.

FORMATTING RULES:
- Never output a giant wall of text.
- Use rich Markdown: ## headers, **bold**, bullet points, numbered lists.
- Use fenced code blocks with language tags for any code.

Context:
${contextText || 'No codebase context available.'}`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      ...historyMessages,
      new HumanMessage(query),
    ]);

    const answer = (response.content as string).trim();

    await this.chatRepo.saveMessage(sessionId, 'user', query);
    await this.chatRepo.saveMessage(sessionId, 'assistant', answer);
    await this.traceRepo.saveTrace(sessionId, 'simple', null, null);

    return {
      mode: 'simple',
      question: query,
      answer,
      sourcesUsed: this.deduplicateSources(sources),
      sessionId,
      namespace: namespace || 'default',
    };
  }

  // ─── AGENTIC MODE ─────────────────────────────────────────────────────────────

  private async handleAgentic(
    query: string,
    namespace: string | undefined,
    sessionId: string,
    projectSummary: string | undefined,
  ) {
    // 1. Plan
    const plan = await this.planner.decompose(query, projectSummary);
    this.logger.log(`Plan (${plan.length} steps): ${plan.join(' | ')}`);

    // 2. Execute each step sequentially
    const steps: StepResult[] = [];
    let previousFindings: string | undefined;

    for (const task of plan) {
      const result = await this.executor.executeStep(task, namespace, previousFindings);
      steps.push(result);
      previousFindings = result.findings;
    }

    // 3. Synthesize
    const answer = await this.synthesizer.synthesize(query, steps, projectSummary);

    // 4. Persist
    await this.chatRepo.saveMessage(sessionId, 'user', query);
    await this.chatRepo.saveMessage(sessionId, 'assistant', answer);
    await this.traceRepo.saveTrace(
      sessionId,
      'agentic',
      plan,
      steps.map(s => ({ task: s.task, findings: s.findings, sourceCount: s.sources.length })),
    );

    const allSources = this.deduplicateSources(steps.flatMap(s => s.sources));

    return {
      mode: 'agentic',
      question: query,
      plan,
      steps: steps.map(s => ({
        task: s.task,
        findings: s.findings,
        sources: s.sources,
      })),
      answer,
      sourcesUsed: allSources,
      sessionId,
      namespace: namespace || 'default',
    };
  }

  // ─── DEBUG MODE ───────────────────────────────────────────────────────────────

  async handleDebug(
    query: string,
    namespace: string | undefined,
    sessionId: string,
    projectSummary: string | undefined,
  ) {
    // 1. Parse stack trace
    const parsed = this.stackParser.parse(query);
    this.logger.log(`Debug: ${parsed.errorType} — ${parsed.fileReferences.length} file refs found`);

    // 2. Build targeted search tasks
    const searchTasks: string[] = [
      `${parsed.errorType} ${parsed.errorMessage}`.substring(0, 200),
    ];

    // Add searches for each referenced file (up to 2)
    for (const ref of parsed.fileReferences.slice(0, 2)) {
      const fileName = ref.file.split(/[/\\]/).pop() || ref.file;
      searchTasks.push(`code in ${fileName}`);
    }

    // 3. Execute searches
    const steps: StepResult[] = [];
    for (const task of searchTasks) {
      const result = await this.executor.executeStep(task, namespace, undefined, 4);
      steps.push(result);
    }

    // 4. Synthesize debug analysis
    const analysis = await this.synthesizer.synthesizeDebug(
      query,
      parsed.fileReferences,
      steps,
    );

    // 5. Persist
    const summaryAnswer = [
      `**Root Cause:** ${analysis.rootCause}`,
      analysis.fixSuggestion ? `**Fix:** ${analysis.fixSuggestion}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    await this.chatRepo.saveMessage(sessionId, 'user', query);
    await this.chatRepo.saveMessage(sessionId, 'assistant', summaryAnswer);
    await this.traceRepo.saveTrace(
      sessionId,
      'debug',
      searchTasks,
      steps.map(s => ({ task: s.task, findings: s.findings })),
    );

    const allSources = this.deduplicateSources(steps.flatMap(s => s.sources));

    return {
      mode: 'debug',
      error: query,
      parsedError: {
        errorType: parsed.errorType,
        errorMessage: parsed.errorMessage,
        fileReferences: parsed.fileReferences,
      },
      ...analysis,
      sourcesUsed: allSources,
      sessionId,
      namespace: namespace || 'default',
    };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────────

  private deduplicateSources(sources: SourceReference[]): SourceReference[] {
    const seen = new Set<string>();
    return sources.filter(s => {
      if (seen.has(s.file)) return false;
      seen.add(s.file);
      return true;
    });
  }
}
