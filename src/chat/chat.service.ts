import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { VectorStorageService } from '../ingestion/vector-storage.service';
import { ChatRepository } from './chat.repository';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import * as crypto from 'crypto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private llm: ChatGroq;

  constructor(
    private readonly vectorStorage: VectorStorageService,
    private readonly chatRepo: ChatRepository
  ) {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      this.logger.warn('GROQ_API_KEY is not set. Chat functionality will fail.');
    }

    this.llm = new ChatGroq({
      apiKey: groqApiKey,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2, // Low temperature for more factual, less creative answers
    });
  }

  async askQuestion(question: string, limit: number = 5, sessionId?: string) {
    const activeSessionId = sessionId || crypto.randomUUID();
    this.logger.log(`Processing question for session ${activeSessionId}: "${question}"`);

    try {
      // 1. Retrieve relevant code chunks from Pinecone
      this.logger.log(`Fetching top ${limit} relevant chunks...`);
      const relevantDocs = await this.vectorStorage.search(question, limit);

      let contextText = '';
      if (relevantDocs && relevantDocs.length > 0) {
        contextText = relevantDocs
          .map((doc, index) => {
            const source = doc.metadata?.source || 'Unknown file';
            return `--- Snippet ${index + 1} from ${source} ---\n${doc.pageContent}`;
          })
          .join('\n\n');
      }

      // 2. Fetch past conversation history
      const history = await this.chatRepo.getMessagesBySessionId(activeSessionId);
      const historyMessages = history.map(msg =>
        msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
      );

      // 3. Construct System Prompt with Context
      const systemPrompt = `You are an expert Software Engineer and Codebase Maintainer assistant.
You have been provided with code snippets from a user's local codebase.
Use the provided context to answer the user's question accurately and concisely.
If no context is provided or if it's irrelevant, just answer based on your general knowledge and the conversation history.

Context:
${contextText || 'No codebase context available.'}`;

      const messages = [
        new SystemMessage(systemPrompt),
        ...historyMessages,
        new HumanMessage(question)
      ];

      // 4. Generate the answer
      this.logger.log('Generating answer via Groq LLM (with memory)...');
      const response = await this.llm.invoke(messages);
      const answer = response.content as string;

      // 5. Save the new conversation turn to the DB
      await this.chatRepo.saveMessage(activeSessionId, 'user', question);
      await this.chatRepo.saveMessage(activeSessionId, 'assistant', answer);

      // 6. Extract unique sources for the response metadata
      const sourcesUsed = Array.from(
        new Set(relevantDocs.map(doc => doc.metadata?.source))
      ).map(source => ({ file: source }));

      return {
        question,
        answer,
        sourcesUsed,
        sessionId: activeSessionId
      };
    } catch (error) {
      this.logger.error('Error during chat processing', (error as Error).stack);
      throw new InternalServerErrorException('Failed to process your chat request. Check DB/Pinecone/Groq connection.');
    }
  }
}
