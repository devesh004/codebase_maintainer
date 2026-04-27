import { Injectable, Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { StepResult, SourceReference } from './executor.service';
import { FileRef } from './stack-trace-parser.service';

export interface DebugAnalysis {
  rootCause: string;
  fileReference: (FileRef & { snippet?: string }) | null;
  fixSuggestion: string;
  codeExample: string;
  prevention: string;
}

@Injectable()
export class SynthesizerService {
  private readonly logger = new Logger(SynthesizerService.name);
  private llm: ChatGroq;

  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
    });
  }

  async synthesize(
    originalQuery: string,
    steps: StepResult[],
    projectSummary?: string,
  ): Promise<string> {
    const stepsText = steps
      .map((s, i) => `Step ${i + 1} — ${s.task}:\n${s.findings}`)
      .join('\n\n');

    const systemPrompt = `You are an expert Software Engineer synthesizing a multi-step codebase investigation.
${projectSummary ? `Project: ${projectSummary}\n` : ''}
Synthesize the research findings into a comprehensive, well-structured answer.

FORMATTING RULES:
- Use rich Markdown: ## headers, **bold**, bullet points, numbered lists
- Use fenced code blocks with language tags for any code
- Separate distinct ideas with blank lines
- Be thorough but organised`;

    const userPrompt = `Original question: "${originalQuery}"\n\nResearch findings:\n${stepsText}\n\nProvide a comprehensive answer:`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    return (response.content as string).trim();
  }

  async synthesizeDebug(
    rawError: string,
    fileReferences: FileRef[],
    steps: StepResult[],
  ): Promise<DebugAnalysis> {
    const stepsText = steps
      .map((s, i) => `Step ${i + 1} — ${s.task}:\n${s.findings}`)
      .join('\n\n');

    const systemPrompt = `You are a debugging expert. Analyse the provided error and code investigation.
Output ONLY valid JSON matching this exact structure (no markdown wrapper):
{
  "rootCause": "clear explanation of why the error occurs",
  "fixSuggestion": "how to fix it in plain English",
  "codeExample": "concrete code snippet that fixes the issue",
  "prevention": "how to prevent this class of error in the future"
}`;

    const userPrompt = `Error:\n${rawError}\n\nCode investigation:\n${stepsText}\n\nProvide debugging analysis as JSON:`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const allSources: SourceReference[] = steps.flatMap(s => s.sources);

    try {
      const content = (response.content as string).trim();
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);

        // Attach snippet to the first matching file reference
        const firstRef = fileReferences[0] ?? null;
        let enrichedRef: (FileRef & { snippet?: string }) | null = null;
        if (firstRef) {
          const matchedSource = allSources.find(s =>
            s.file.includes(firstRef.file) || firstRef.file.includes(s.displayName),
          );
          enrichedRef = { ...firstRef, snippet: matchedSource?.snippet };
        }

        return {
          rootCause: parsed.rootCause || 'Could not determine root cause.',
          fileReference: enrichedRef,
          fixSuggestion: parsed.fixSuggestion || '',
          codeExample: parsed.codeExample || '',
          prevention: parsed.prevention || '',
        };
      }
    } catch (e) {
      this.logger.error('Failed to parse debug JSON response', e);
    }

    return {
      rootCause: response.content as string,
      fileReference: fileReferences[0] ?? null,
      fixSuggestion: '',
      codeExample: '',
      prevention: '',
    };
  }
}
