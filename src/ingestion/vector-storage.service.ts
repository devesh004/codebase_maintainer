import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeEmbeddings } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';

@Injectable()
export class VectorStorageService implements OnModuleInit {
  private readonly logger = new Logger(VectorStorageService.name);
  private pinecone: Pinecone;
  private embeddings: PineconeEmbeddings;
  private indexName: string;

  async onModuleInit() {
    this.logger.log('Initializing VectorStorageService with Pinecone...');
    try {
      const apiKey = process.env.PINECONE_API_KEY || '';
      if (!apiKey) {
        this.logger.warn('PINECONE_API_KEY is not set. Vector ops will fail.');
      }

      this.pinecone = new Pinecone({ apiKey });
      this.indexName = process.env.PINECONE_INDEX || 'codebase';

      this.embeddings = new PineconeEmbeddings({
        apiKey,
        model: 'multilingual-e5-large',
      });

      this.logger.log('Pinecone client initialized successfully.');
    } catch (error) {
      this.logger.error(`Failed to init Pinecone: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  private async getVectorStore(namespace?: string): Promise<PineconeStore> {
    const pineconeIndex = this.pinecone.Index(this.indexName);
    return PineconeStore.fromExistingIndex(this.embeddings, {
      pineconeIndex,
      namespace,
    });
  }

  async storeDocuments(docs: Document[], namespace?: string): Promise<void> {
    // Filter out documents with empty/whitespace-only content
    const validDocs = docs.filter(doc => doc.pageContent?.trim().length > 0);
    if (validDocs.length < docs.length) {
      this.logger.warn(`Skipped ${docs.length - validDocs.length} empty/blank documents.`);
    }
    if (validDocs.length === 0) {
      this.logger.warn('No valid documents to store. Skipping.');
      return;
    }

    const vectorStore = await this.getVectorStore(namespace);
    const nsLabel = namespace || 'default';
    this.logger.log(`Storing ${validDocs.length} documents into Pinecone (namespace: "${nsLabel}")...`);

    const BATCH_SIZE = 50;
    const DELAY_MS = 1000;

    for (let i = 0; i < validDocs.length; i += BATCH_SIZE) {
      const batch = validDocs.slice(i, i + BATCH_SIZE);
      this.logger.log(`Embedding & Storing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(validDocs.length / BATCH_SIZE)}...`);

      await vectorStore.addDocuments(batch);

      if (i + BATCH_SIZE < validDocs.length) {
        this.logger.log(`Waiting ${DELAY_MS}ms to prevent rate limits...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    this.logger.log(`Documents successfully stored in Pinecone (namespace: "${nsLabel}").`);
  }

  async search(query: string, limit: number = 5, namespace?: string): Promise<Document[]> {
    const vectorStore = await this.getVectorStore(namespace);
    const nsLabel = namespace || 'default';
    this.logger.log(`Searching Pinecone for: "${query}" (limit: ${limit}, namespace: "${nsLabel}")`);
    return vectorStore.similaritySearch(query, limit);
  }
}
