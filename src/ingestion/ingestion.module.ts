import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { RepoConnectorService } from './repo-connector.service';
import { CodeParserService } from './code-parser.service';
import { VectorStorageService } from './vector-storage.service';

@Module({
  controllers: [IngestionController],
  providers: [RepoConnectorService, CodeParserService, VectorStorageService],
  exports: [VectorStorageService]
})
export class IngestionModule { }
