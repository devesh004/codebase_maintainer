import { Controller, Post, Body, Get, Query, BadRequestException } from '@nestjs/common';
import { RepoConnectorService } from './repo-connector.service';
import { GitHubConnectorService } from './github-connector.service';
import { CodeParserService } from './code-parser.service';
import { VectorStorageService } from './vector-storage.service';

/** Returns true if the source string looks like a GitHub repo URL. */
function isGitHubUrl(source: string): boolean {
  return /^(https?:\/\/)?(www\.)?github\.com\/[^/]+\/[^/]+/i.test(source);
}

@Controller('ingestion')
export class IngestionController {
    constructor(
        private readonly repoConnector: RepoConnectorService,
        private readonly githubConnector: GitHubConnectorService,
        private readonly codeParser: CodeParserService,
        private readonly vectorStorage: VectorStorageService,
    ) { }

    @Post('ingest')
    async ingestRepo(
        @Body('source') source: string,
        @Body('namespace') namespace?: string,
    ) {
        if (!source) {
            throw new BadRequestException('source is required (local path or GitHub URL)');
        }

        // 1. Read files — delegate to the right connector
        const files = isGitHubUrl(source)
            ? await this.githubConnector.readFromGitHub(source)
            : await this.repoConnector.readDirectory(source);

        if (files.length === 0) {
            return { message: 'No valid files found to ingest.' };
        }

        // 2. Parse into documents
        const documents = await this.codeParser.parseFiles(files);

        // 3. Store into Pinecone DB (scoped to namespace if provided)
        await this.vectorStorage.storeDocuments(documents, namespace);

        return {
            message: 'Ingestion complete',
            source,
            namespace: namespace || 'default',
            filesProcessed: files.length,
            chunksStored: documents.length,
        };
    }

    @Get('search')
    async searchCode(
        @Query('query') query: string,
        @Query('limit') limit?: string,
        @Query('namespace') namespace?: string,
    ) {
        if (!query) {
            throw new BadRequestException('Query parameter is required');
        }
        const results = await this.vectorStorage.search(query, limit ? parseInt(limit, 10) : 5, namespace);
        return {
            query,
            namespace: namespace || 'default',
            results: results.map(doc => ({
                content: doc.pageContent,
                metadata: doc.metadata,
            })),
        };
    }
}
