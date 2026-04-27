import { Injectable, Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private llm: ChatGroq;

  constructor() {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.1,
    });
  }

  async decompose(query: string, projectSummary?: string): Promise<string[]> {
    const systemPrompt = `You are a task planner for a codebase Q&A system.
Given a complex question about a codebase, break it into 2-4 focused sub-task search queries.
Each sub-task should be a specific search phrase to find relevant code in a vector database.
Output ONLY a valid JSON array of strings — no explanation, no markdown.
Example: ["Find authentication middleware", "Trace request lifecycle in auth module", "Identify JWT token handling"]`;

    const contextLine = projectSummary ? `Project: ${projectSummary}\n\n` : '';
    const userPrompt = `${contextLine}User question: "${query}"\n\nGenerate 2-4 focused search queries as a JSON array:`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = (response.content as string).trim();
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        const tasks = JSON.parse(match[0]) as string[];
        return tasks.slice(0, 4);
      }
    } catch (error) {
      this.logger.warn('Planner LLM call failed, falling back to single query', (error as Error).message);
    }

    return [query];
  }
}
