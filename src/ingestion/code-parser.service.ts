import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { FileData } from './repo-connector.service';
import * as path from 'path';

@Injectable()
export class CodeParserService {
    private readonly logger = new Logger(CodeParserService.name);

    async parseFiles(files: FileData[]): Promise<Document[]> {
        const allDocuments: Document[] = [];

        // Create a splitter optimized for generic text/code
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        for (const file of files) {
            try {
                const ext = path.extname(file.filePath).toLowerCase();

                const docs = await splitter.createDocuments(
                    [file.content],
                    [{ source: file.filePath, extension: ext }]
                );
                allDocuments.push(...docs);
            } catch (error) {
                this.logger.warn(`Failed to parse file ${file.filePath}: ${(error as Error).message}`);
            }
        }

        this.logger.log(`Parsed ${files.length} files into ${allDocuments.length} chunks.`);
        return allDocuments;
    }
}
