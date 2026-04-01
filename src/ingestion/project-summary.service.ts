import { Injectable, Logger } from '@nestjs/common';
import { FileData } from './repo-connector.service';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

@Injectable()
export class ProjectSummaryService {
    private readonly logger = new Logger(ProjectSummaryService.name);
    private llm: ChatGroq | null = null;

    constructor() {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (groqApiKey) {
            this.llm = new ChatGroq({
                apiKey: groqApiKey,
                model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
                temperature: 0.1, // very low temp for factual summary
            });
        }
    }

    async generateSummary(files: FileData[]): Promise<string> {
        if (!this.llm) {
            this.logger.warn('GROQ_API_KEY is missing. Skipping LLM summary generation.');
            return 'Summary generation skipped due to missing API key.';
        }

        try {
            // Try to find a README file
            const readmeFile = files.find(f => 
                f.filePath.toLowerCase().endsWith('readme.md') || 
                f.filePath.toLowerCase() === 'readme'
            );

            // Extract just the file paths to show the folder structure
            // Limit to top 100 to avoid excessive token size
            const filePaths = files.map(f => f.filePath).slice(0, 100).join('\n');
            const readmeContent = readmeFile ? readmeFile.content.substring(0, 3000) : 'No README provided in this repository.';

            const systemPrompt = `You are an expert Software Architect assisting in cataloging a codebase. 
Your task is to provide a concise, factual technical summary (2-3 sentences) of this repository.
Focus on its primary purpose, architecture, and the technologies it appears to use, based on the README snippet and folder structure provided.`;

            const userPrompt = `Folder structure snippet:\n${filePaths}\n\nREADME contents snippet:\n${readmeContent}\n\nPlease output only the summary.`;

            const messages = [
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt)
            ];

            this.logger.log('Generating project summary via Groq...');
            const response = await this.llm.invoke(messages);
            return (response.content as string).trim();
            
        } catch (error) {
            this.logger.error('Failed to generate project summary', (error as Error).stack);
            return 'Failed to automatically generate project summary.';
        }
    }
}
