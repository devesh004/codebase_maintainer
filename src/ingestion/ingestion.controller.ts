import { Controller, Post, Body, Get, Query, BadRequestException } from '@nestjs/common';
import { RepoConnectorService } from './repo-connector.service';
import { CodeParserService } from './code-parser.service';
import { VectorStorageService } from './vector-storage.service';

@Controller('ingestion')
export class IngestionController {
    constructor(
        private readonly repoConnector: RepoConnectorService,
        private readonly codeParser: CodeParserService,
        private readonly vectorStorage: VectorStorageService,
    ) { }

    @Post('ingest')
    async ingestRepo(@Body('path') dirPath: string) {
        if (!dirPath) {
            throw new BadRequestException('Path is required');
        }

        // 1. Read files
        const files = await this.repoConnector.readDirectory(dirPath);
        if (files.length === 0) {
            return { message: 'No valid files found to ingest.' };
        }

        // 2. Parse into documents
        const documents = await this.codeParser.parseFiles(files);

        // 3. Store into Pinecone DB
        await this.vectorStorage.storeDocuments(documents);

        return {
            message: 'Ingestion complete',
            filesProcessed: files.length,
            chunksStored: documents.length,
        };
    }

    @Get('search')
    async searchCode(@Query('query') query: string, @Query('limit') limit?: string) {
        if (!query) {
            throw new BadRequestException('Query parameter is required');
        }
        const results = await this.vectorStorage.search(query, limit ? parseInt(limit, 10) : 5);
        return {
            query,
            results: results.map(doc => ({
                content: doc.pageContent,
                metadata: doc.metadata,
            })),
        };
    }
}
