import { Injectable, Logger } from '@nestjs/common';
import { VectorStorageService } from '../ingestion/vector-storage.service';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';

export interface SourceReference {
  file: string;
  displayName: string;
  relativePath: string;
  snippet: string;
  language: string;
}

export interface StepResult {
  task: string;
  sources: SourceReference[];
  findings: string;
  docs: Document[];
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', go: 'go', java: 'java',
  rb: 'ruby', rs: 'rust', cpp: 'cpp',
  c: 'c', cs: 'csharp', php: 'php',
  swift: 'swift', kt: 'kotlin',
  md: 'markdown', json: 'json',
  yaml: 'yaml', yml: 'yaml',
  sh: 'bash', sql: 'sql',
  html: 'html', css: 'css', scss: 'css',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANG_MAP[ext] || 'plaintext';
}

function buildSource(doc: Document): SourceReference {
  const file = doc.metadata?.source || 'Unknown';
  const parts = file.split(/[/\\]/);
  const displayName = parts.pop() || file;
  const relativePath = parts.length > 0 ? `${parts.slice(-2).join('/')}/${displayName}` : displayName;
  return {
    file,
    displayName,
    relativePath,
    snippet: doc.pageContent.substring(0, 500).trim(),
    language: detectLanguage(file),
  };
}

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);
  private llm: ChatGroq;

  constructor(private readonly vectorStorage: VectorStorageService) {
    this.llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY || '',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.1,
    });
  }

  async executeStep(
    task: string,
    namespace?: string,
    previousFindings?: string,
    limit: number = 5,
  ): Promise<StepResult> {
    const docs = await this.vectorStorage.search(task, limit, namespace);

    const contextText = docs
      .map((doc, i) => {
        const src = doc.metadata?.source || 'Unknown';
        return `--- Chunk ${i + 1} from ${src} ---\n${doc.pageContent}`;
      })
      .join('\n\n');

    const prevContext = previousFindings
      ? `\nPrevious investigation findings:\n${previousFindings}\n`
      : '';

    const systemPrompt = `You are a code analyst performing a focused investigation step.${prevContext}
Be concise. Focus only on what the retrieved code reveals about the current sub-task.`;

    const userPrompt = `Sub-task: "${task}"\n\nRelevant code:\n${contextText || 'No relevant code found for this query.'}\n\nWhat does this code tell us about the sub-task?`;

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const sources = docs.map(buildSource);

    return {
      task,
      sources,
      findings: (response.content as string).trim(),
      docs,
    };
  }

  buildSourcesFromDocs(docs: Document[]): SourceReference[] {
    return docs.map(buildSource);
  }
}
