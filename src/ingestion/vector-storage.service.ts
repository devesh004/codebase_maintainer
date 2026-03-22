import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeEmbeddings } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';

@Injectable()
export class VectorStorageService implements OnModuleInit {
  private readonly logger = new Logger(VectorStorageService.name);
  private vectorStore: PineconeStore;

  async onModuleInit() {
    this.logger.log('Initializing VectorStorageService with Pinecone...');
    try {
      const apiKey = process.env.PINECONE_API_KEY || '';
      if (!apiKey) {
        this.logger.warn('PINECONE_API_KEY is not set. Vector ops will fail.');
      }

      // Initialize Pinecone Client
      const pinecone = new Pinecone({ apiKey });
      const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX || 'codebase');

      // Setup Pinecone Embeddings using their Inference API
      const embeddings = new PineconeEmbeddings({
        apiKey,
        model: 'multilingual-e5-large', // Pinecone's standard text embedding model
      });

      this.vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
      });

      this.logger.log('Pinecone DB initialized successfully.');
    } catch (error) {
       this.logger.error(`Failed to init Pinecone: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async storeDocuments(docs: Document[]): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    // Filter out documents with empty/whitespace-only content — Pinecone's
    // embed API crashes with `.map()` on undefined when given empty inputs.
    const validDocs = docs.filter(doc => doc.pageContent?.trim().length > 0);
    if (validDocs.length < docs.length) {
      this.logger.warn(`Skipped ${docs.length - validDocs.length} empty/blank documents.`);
    }
    if (validDocs.length === 0) {
      this.logger.warn('No valid documents to store. Skipping.');
      return;
    }

    this.logger.log(`Storing ${validDocs.length} documents into Pinecone...`);

    const BATCH_SIZE = 50; 
    const DELAY_MS = 1000;
    
    for (let i = 0; i < validDocs.length; i += BATCH_SIZE) {
      const batch = validDocs.slice(i, i + BATCH_SIZE);
      this.logger.log(`Embedding & Storing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(validDocs.length / BATCH_SIZE)}...`);
      
      await this.vectorStore.addDocuments(batch);

      if (i + BATCH_SIZE < validDocs.length) {
        this.logger.log(`Waiting ${DELAY_MS}ms to prevent rate limits...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    
    this.logger.log('Documents successfully stored in Pinecone DB.');
  }

  async search(query: string, limit: number = 5): Promise<Document[]> {
     if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }
    this.logger.log(`Searching Pinecone for: "${query}" (limit: ${limit})`);
    return this.vectorStore.similaritySearch(query, limit);
  }
}
